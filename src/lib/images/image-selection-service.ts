import type { PlaceImageAsset } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ExternalApiBudgetExceededError } from '@/lib/providers/external-api-gateway';

import {
  rerankPlacePhotoBatchesWithLlm,
  type PlacePhotoBatchInput,
} from './image-llm-reranker';
import { verifyImageCandidate, type ImageVerificationContext } from './image-verification';
import {
  resolveGooglePlacesImageApiKey,
  searchGooglePlacesImageCandidates,
} from './providers/google-places-image-client';
import {
  resolvePexelsApiKey,
  searchPexelsCandidates,
} from './providers/pexels-client';
import type {
  ProviderImageCandidate,
  ProviderImageQuery,
} from './providers/types';
import {
  resolveUnsplashAccessKey,
  searchUnsplashCandidates,
} from './providers/unsplash-client';
import { searchWikimediaCommonsCandidates } from './providers/wikimedia-commons-client';
import { searchWikipediaSightCandidates } from './providers/wikipedia-sights-client';

const IMAGE_ASSET_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const IMAGE_SELECTION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const VERIFICATION_VERSION = 'v2-llm-batch';
const IMAGE_VERIFICATION_ENABLED = (() => {
  const raw = process.env.IMAGE_VERIFICATION_ENABLED?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return false;
})();
const ENABLE_GOOGLE_TEXT_SEARCH = process.env.ENABLE_GOOGLE_TEXT_SEARCH === 'true';
const IMAGE_FAST_MODE = (() => {
  const raw = process.env.IMAGE_FAST_MODE?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return true;
})();
const IMAGE_FAST_PROVIDER_TIMEOUT_MS = (() => {
  const raw = Number(process.env.IMAGE_FAST_PROVIDER_TIMEOUT_MS ?? 1800);
  if (!Number.isFinite(raw) || raw <= 0) return 1800;
  return Math.floor(raw);
})();
const IMAGE_LLM_RERANK_ENABLED = (() => {
  const raw = process.env.IMAGE_LLM_RERANK_ENABLED?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return process.env.NODE_ENV !== 'test';
})();
const IMAGE_LLM_MAX_CANDIDATES = 15;
const DETERMINISTIC_WEIGHT = 0.6;
const LLM_WEIGHT = 0.4;
const PRIMARY_PROVIDER_BATCH_SIZE = 4;
const PRIMARY_PROVIDER_PER_SOURCE_TARGET = 1;
const IMAGE_LLM_ACCEPT_THRESHOLD = (() => {
  const raw = Number(process.env.IMAGE_LLM_ACCEPT_THRESHOLD ?? 0.72);
  if (!Number.isFinite(raw)) return 0.72;
  return Math.max(0, Math.min(1, raw));
})();
const IMAGE_VERIFICATION_DEBUG = (() => {
  const raw = process.env.IMAGE_VERIFICATION_DEBUG?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return process.env.NODE_ENV !== 'production';
})();
const IMAGE_VERIFICATION_LOG_LIMIT = 12;

let imagePersistenceEnabled = true;
let loggedMissingImageTables = false;
let loggedGoogleTextSearchDisabled = false;
const backgroundVerificationInFlight = new Set<string>();

export type PlaceImageAttribution = {
  displayName?: string;
  uri?: string;
};

export type PlaceImageEntry = {
  url: string;
  attribution?: PlaceImageAttribution;
};

type PrimaryProviderCandidates = {
  wikipediaCandidates: ProviderImageCandidate[];
  wikimediaCandidates: ProviderImageCandidate[];
  pexelsCandidates: ProviderImageCandidate[];
  unsplashCandidates: ProviderImageCandidate[];
};

type VerifiedCandidate = {
  candidate: ProviderImageCandidate;
  deterministicScore: number;
  llmScore: number | null;
  finalScore: number;
  reasonCodes: string[];
  status: 'VERIFIED' | 'REJECTED' | 'REVIEW';
};

type VerificationCandidateForLogs = {
  candidate: Pick<
    ProviderImageCandidate,
    'providerImageId' | 'title' | 'description' | 'city' | 'country'
  >;
  deterministicScore: number;
  llmScore?: number | null;
  finalScore: number;
  reasonCodes: string[];
  status: 'VERIFIED' | 'REJECTED' | 'REVIEW';
};

export type ImageVerificationLogRow = {
  rank: number;
  providerImageId: string;
  title: string;
  status: 'VERIFIED' | 'REJECTED' | 'REVIEW';
  finalScore: number;
  deterministicScore: number;
  llmScore?: number | null;
  reasonCodes: string[];
  city?: string;
  country?: string;
};

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2021'
  );
}

function disableImagePersistence(reason: string): void {
  imagePersistenceEnabled = false;
  if (!loggedMissingImageTables) {
    loggedMissingImageTables = true;
    console.warn(`[image-selection] disabling DB persistence: ${reason}`);
  }
}

function normalizeQueryPart(value?: string): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildQueryKey(query: ProviderImageQuery): string {
  return [
    normalizeQueryPart(query.placeId),
    normalizeQueryPart(query.textQuery),
    normalizeQueryPart(query.city),
    normalizeQueryPart(query.country),
    normalizeQueryPart(query.category),
    normalizeQueryPart(query.description),
    `${query.width}x${query.height}`,
  ].join('|');
}

function countStatuses(candidates: VerificationCandidateForLogs[]): {
  verified: number;
  review: number;
  rejected: number;
} {
  return candidates.reduce(
    (acc, candidate) => {
      if (candidate.status === 'VERIFIED') acc.verified += 1;
      else if (candidate.status === 'REVIEW') acc.review += 1;
      else acc.rejected += 1;
      return acc;
    },
    { verified: 0, review: 0, rejected: 0 }
  );
}

function toLogTitle(candidate: VerificationCandidateForLogs['candidate']): string {
  const text = candidate.title || candidate.description || '(untitled)';
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

function buildVerificationLogRows(
  candidates: VerificationCandidateForLogs[]
): ImageVerificationLogRow[] {
  return [...candidates]
    .sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      if (a.status === b.status) return 0;
      const order = { VERIFIED: 0, REVIEW: 1, REJECTED: 2 } as const;
      return order[a.status] - order[b.status];
    })
    .map((candidate, index) => ({
      rank: index + 1,
      providerImageId: candidate.candidate.providerImageId,
      title: toLogTitle(candidate.candidate),
      status: candidate.status,
      finalScore: candidate.finalScore,
      deterministicScore: candidate.deterministicScore,
      llmScore: candidate.llmScore,
      reasonCodes: candidate.reasonCodes,
      city: candidate.candidate.city,
      country: candidate.candidate.country,
    }));
}

export function __buildVerificationLogRowsForTests(
  candidates: VerificationCandidateForLogs[]
): ImageVerificationLogRow[] {
  return buildVerificationLogRows(candidates);
}

export function isImageFastModeEnabled(): boolean {
  return IMAGE_FAST_MODE;
}

function logVerificationRanking(
  providerName: string,
  queryKey: string,
  context: ImageVerificationContext,
  candidates: VerificationCandidateForLogs[]
): void {
  if (!IMAGE_VERIFICATION_DEBUG) return;

  const counts = countStatuses(candidates);
  const rows = buildVerificationLogRows(candidates);

  console.info(
    `[image-selection] verification provider=${providerName} query="${context.textQuery}" key=${queryKey} total=${candidates.length} verified=${counts.verified} review=${counts.review} rejected=${counts.rejected}`
  );

  rows.slice(0, IMAGE_VERIFICATION_LOG_LIMIT).forEach((row) => {
    console.info(
      `[image-selection] rank=${row.rank} provider=${providerName} status=${row.status} final=${row.finalScore.toFixed(3)} deterministic=${row.deterministicScore.toFixed(3)} llm=${row.llmScore === null || row.llmScore === undefined ? '-' : row.llmScore.toFixed(3)} id=${row.providerImageId} title="${row.title}" city=${row.city ?? '-'} country=${row.country ?? '-'} reasons=${row.reasonCodes.join('|')}`
    );
  });
}

function selectWithSeed<T>(items: T[], count: number, sig: number): T[] {
  if (items.length === 0 || count <= 0) return [];
  if (items.length <= count) return items;

  const selected: T[] = [];
  const startIndex = sig > 0 ? sig % items.length : 0;
  for (let i = 0; i < items.length && selected.length < count; i += 1) {
    const idx = (startIndex + i) % items.length;
    selected.push(items[idx]);
  }
  return selected;
}

function toEntry(asset: Pick<PlaceImageAsset, 'url' | 'attributionJson'>): PlaceImageEntry {
  const attributionSource =
    typeof asset.attributionJson === 'object' && asset.attributionJson !== null
      ? (asset.attributionJson as Record<string, unknown>)
      : {};

  const attribution: PlaceImageAttribution = {};
  if (typeof attributionSource.displayName === 'string') {
    attribution.displayName = attributionSource.displayName;
  }
  if (typeof attributionSource.uri === 'string') {
    attribution.uri = attributionSource.uri;
  }

  const entry: PlaceImageEntry = { url: asset.url };
  if (attribution.displayName || attribution.uri) {
    entry.attribution = attribution;
  }
  return entry;
}

async function loadVerifiedAssets(queryKey: string, count: number): Promise<PlaceImageAsset[]> {
  if (!imagePersistenceEnabled) return [];

  const now = new Date();
  try {
    const [selection, verified] = await Promise.all([
      prisma.placeImageSelection.findUnique({
        where: { queryKey },
        include: { asset: true },
      }),
      prisma.placeImageAsset.findMany({
        where: {
          queryKey,
          status: 'VERIFIED',
          expiresAt: { gt: now },
        },
        orderBy: { finalScore: 'desc' },
        take: Math.max(count * 3, 12),
      }),
    ]);

    const merged: PlaceImageAsset[] = [];
    const seen = new Set<string>();

    if (
      selection &&
      selection.expiresAt > now &&
      selection.asset.status === 'VERIFIED' &&
      selection.asset.expiresAt > now
    ) {
      merged.push(selection.asset);
      seen.add(selection.asset.id);
    }

    for (const asset of verified) {
      if (seen.has(asset.id)) continue;
      merged.push(asset);
      seen.add(asset.id);
    }

    return merged;
  } catch (error) {
    if (isMissingTableError(error)) {
      disableImagePersistence('image tables not migrated yet');
      return [];
    }

    console.warn('[image-selection] failed to load verified assets', error);
    return [];
  }
}

async function persistCandidate(
  queryKey: string,
  placeId: string | undefined,
  verifiedCandidate: VerifiedCandidate
): Promise<PlaceImageAsset | null> {
  if (!imagePersistenceEnabled) return null;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + IMAGE_ASSET_TTL_MS);

  try {
    return await prisma.placeImageAsset.upsert({
      where: {
        provider_providerImageId: {
          provider: verifiedCandidate.candidate.provider,
          providerImageId: verifiedCandidate.candidate.providerImageId,
        },
      },
      create: {
        placeId: placeId ?? null,
        queryKey,
        provider: verifiedCandidate.candidate.provider,
        providerImageId: verifiedCandidate.candidate.providerImageId,
        providerPhotoRef: verifiedCandidate.candidate.providerPhotoRef ?? null,
        url: verifiedCandidate.candidate.url,
        thumbnailUrl: verifiedCandidate.candidate.thumbnailUrl ?? null,
        width: verifiedCandidate.candidate.width,
        height: verifiedCandidate.candidate.height,
        attributionJson: verifiedCandidate.candidate.attribution,
        licenseCode: verifiedCandidate.candidate.licenseCode,
        photographerName: verifiedCandidate.candidate.photographerName ?? null,
        status: verifiedCandidate.status,
        deterministicScore: verifiedCandidate.deterministicScore,
        llmScore: verifiedCandidate.llmScore,
        finalScore: verifiedCandidate.finalScore,
        reasonCodes: verifiedCandidate.reasonCodes,
        verificationVersion: VERIFICATION_VERSION,
        verifiedAt: now,
        expiresAt,
      },
      update: {
        ...(placeId ? { placeId } : {}),
        queryKey,
        providerPhotoRef: verifiedCandidate.candidate.providerPhotoRef ?? null,
        url: verifiedCandidate.candidate.url,
        thumbnailUrl: verifiedCandidate.candidate.thumbnailUrl ?? null,
        width: verifiedCandidate.candidate.width,
        height: verifiedCandidate.candidate.height,
        attributionJson: verifiedCandidate.candidate.attribution,
        licenseCode: verifiedCandidate.candidate.licenseCode,
        photographerName: verifiedCandidate.candidate.photographerName ?? null,
        status: verifiedCandidate.status,
        deterministicScore: verifiedCandidate.deterministicScore,
        llmScore: verifiedCandidate.llmScore,
        finalScore: verifiedCandidate.finalScore,
        reasonCodes: verifiedCandidate.reasonCodes,
        verificationVersion: VERIFICATION_VERSION,
        verifiedAt: now,
        expiresAt,
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      disableImagePersistence('image tables not migrated yet');
      return null;
    }

    console.warn('[image-selection] failed to persist image candidate', error);
    return null;
  }
}

async function persistSelection(
  queryKey: string,
  placeId: string | undefined,
  assetId: string,
  provider: ProviderImageCandidate['provider']
) {
  if (!imagePersistenceEnabled) return;

  try {
    await prisma.placeImageSelection.upsert({
      where: { queryKey },
      create: {
        queryKey,
        placeId: placeId ?? null,
        assetId,
        provider,
        expiresAt: new Date(Date.now() + IMAGE_SELECTION_TTL_MS),
      },
      update: {
        ...(placeId ? { placeId } : {}),
        assetId,
        provider,
        expiresAt: new Date(Date.now() + IMAGE_SELECTION_TTL_MS),
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      disableImagePersistence('image tables not migrated yet');
      return;
    }

    console.warn('[image-selection] failed to persist query selection', error);
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function uniqueReasonCodes(reasonCodes: string[]): string[] {
  return Array.from(new Set(reasonCodes.filter(Boolean)));
}

type PersistedCandidate = {
  candidate: VerifiedCandidate;
  asset: PlaceImageAsset | null;
};

async function persistVerifiedCandidates(
  queryKey: string,
  placeId: string | undefined,
  verifiedCandidates: VerifiedCandidate[]
): Promise<PersistedCandidate[]> {
  return Promise.all(
    verifiedCandidates.map(async (candidate) => ({
      candidate,
      asset: await persistCandidate(queryKey, placeId, candidate),
    }))
  );
}

function entryFromCandidate(candidate: VerifiedCandidate): PlaceImageEntry {
  return {
    url: candidate.candidate.url,
    attribution:
      candidate.candidate.attribution.displayName || candidate.candidate.attribution.uri
        ? {
            ...(candidate.candidate.attribution.displayName
              ? { displayName: candidate.candidate.attribution.displayName }
              : null),
            ...(candidate.candidate.attribution.uri
              ? { uri: candidate.candidate.attribution.uri }
              : null),
          }
        : undefined,
  };
}

function entryFromProviderCandidate(candidate: ProviderImageCandidate): PlaceImageEntry {
  return {
    url: candidate.url,
    attribution:
      candidate.attribution.displayName || candidate.attribution.uri
        ? {
            ...(candidate.attribution.displayName
              ? { displayName: candidate.attribution.displayName }
              : null),
            ...(candidate.attribution.uri
              ? { uri: candidate.attribution.uri }
              : null),
          }
        : undefined,
  };
}

function buildFastPathCandidatePool(
  sourceCandidates: ProviderImageCandidate[][]
): ProviderImageCandidate[] {
  const selected: ProviderImageCandidate[] = [];
  const seen = new Set<string>();

  sourceCandidates.forEach((source) => {
    source.forEach((candidate) => {
      const key = `${candidate.provider}:${candidate.providerImageId}:${candidate.url}`;
      if (seen.has(key)) return;
      seen.add(key);
      selected.push(candidate);
    });
  });

  return selected;
}

export function __buildFastPathCandidatePoolForTests(
  sourceCandidates: ProviderImageCandidate[][]
): ProviderImageCandidate[] {
  return buildFastPathCandidatePool(sourceCandidates);
}

async function finalizeAcceptedCandidates(
  queryKey: string,
  placeId: string | undefined,
  accepted: PersistedCandidate[]
): Promise<PlaceImageEntry[]> {
  if (accepted.length === 0) return [];

  const winner = accepted[0];
  if (winner.asset) {
    await persistSelection(queryKey, placeId, winner.asset.id, winner.candidate.candidate.provider);
  }

  return accepted.map((entry) => {
    if (entry.asset) return toEntry(entry.asset);
    return entryFromCandidate(entry.candidate);
  });
}

function toTimeoutError(providerName: string, timeoutMs: number): Error {
  return new Error(`${providerName} timeout after ${timeoutMs}ms`);
}

async function withTimeout<T>(
  promiseFactory: () => Promise<T>,
  providerName: string,
  timeoutMs?: number
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promiseFactory();
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(toTimeoutError(providerName, timeoutMs));
    }, timeoutMs);

    promiseFactory()
      .then((result) => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

async function fetchCandidatesFromProvider(
  providerName: string,
  fetcher: () => Promise<ProviderImageCandidate[]>,
  timeoutMs?: number
): Promise<ProviderImageCandidate[]> {
  try {
    return await withTimeout(fetcher, providerName, timeoutMs);
  } catch (error) {
    if (error instanceof ExternalApiBudgetExceededError) {
      console.warn(`[image-selection] ${providerName} skipped due to budget cap`);
      return [];
    }
    if (error instanceof Error && error.message.includes('timeout')) {
      console.warn(`[image-selection] ${providerName} timed out`);
      return [];
    }
    console.warn(`[image-selection] ${providerName} provider failed`, error);
    return [];
  }
}

function pickPrimaryBatchCandidates(
  sourceCandidates: ProviderImageCandidate[][]
): ProviderImageCandidate[] {
  const selected: ProviderImageCandidate[] = [];
  const seen = new Set<string>();

  const appendCandidate = (candidate: ProviderImageCandidate): void => {
    const key = `${candidate.provider}:${candidate.providerImageId}:${candidate.url}`;
    if (seen.has(key)) return;
    selected.push(candidate);
    seen.add(key);
  };

  sourceCandidates.forEach((source) => {
    const takeCount = Math.min(PRIMARY_PROVIDER_PER_SOURCE_TARGET, source.length);
    for (let i = 0; i < takeCount; i += 1) {
      appendCandidate(source[i]);
    }
  });

  return selected.slice(0, PRIMARY_PROVIDER_BATCH_SIZE);
}

const SIGHT_CATEGORY_KEYS = new Set([
  'landmark',
  'museum',
  'park',
  'neighborhood',
  'city',
  'country',
  'sight',
]);

const MUSEUM_THEME_TOKENS = ['museum', 'gallery', 'exhibit', 'art', 'paintings'];
const ARCHITECTURE_THEME_TOKENS = ['architecture', 'city landmark', 'urban skyline', 'design'];
const OUTDOOR_THEME_TOKENS = ['hiking', 'nature trail', 'mountains', 'national park'];
const FOOD_THEME_TOKENS = ['food', 'restaurant ambiance', 'dining', 'culinary'];
const WATER_THEME_TOKENS = ['coastline', 'ocean view', 'lake scenery', 'waterfront'];

function splitTokens(value?: string): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function normalizedCategory(value?: string): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, '')
    .replace(/\s+/g, '_');
}

function shouldUseSightSources(query: ProviderImageQuery): boolean {
  const category = normalizedCategory(query.category);
  if (SIGHT_CATEGORY_KEYS.has(category)) return true;
  if (splitTokens(query.name).length >= 2) return true;
  return false;
}

function buildSightQueryText(query: ProviderImageQuery): string {
  const parts = [query.name, query.city, query.country]
    .map((part) => part?.trim())
    .filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(' ');
  return query.textQuery;
}

function detectVibeThemeTokens(query: ProviderImageQuery): string[] {
  const category = normalizedCategory(query.category);
  const tokens = new Set([
    ...splitTokens(query.textQuery),
    ...splitTokens(query.name),
    ...splitTokens(query.description),
  ]);

  if (category.includes('museum') || tokens.has('museum') || tokens.has('gallery')) {
    return MUSEUM_THEME_TOKENS;
  }
  if (
    category.includes('park') ||
    tokens.has('hike') ||
    tokens.has('hiking') ||
    tokens.has('trail') ||
    tokens.has('yosemite') ||
    tokens.has('canyon') ||
    tokens.has('summit') ||
    tokens.has('falls')
  ) {
    return OUTDOOR_THEME_TOKENS;
  }
  if (
    tokens.has('beach') ||
    tokens.has('coast') ||
    tokens.has('ocean') ||
    tokens.has('waterfront') ||
    tokens.has('lake')
  ) {
    return WATER_THEME_TOKENS;
  }
  if (category.includes('restaurant') || tokens.has('restaurant') || tokens.has('food')) {
    return FOOD_THEME_TOKENS;
  }
  return ARCHITECTURE_THEME_TOKENS;
}

function buildVibeQueryText(query: ProviderImageQuery): string {
  const theme = detectVibeThemeTokens(query).join(' ');
  const preservePlaceContext = shouldUseSightSources(query);
  const anchorText = preservePlaceContext
    ? [query.name?.trim(), query.city?.trim(), query.country?.trim()].filter(Boolean).join(' ')
    : '';
  const locality = [query.city, query.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return [anchorText, theme, locality].filter(Boolean).join(' ').trim() || query.textQuery;
}

function withTextQuery(
  query: ProviderImageQuery & { sig: number },
  textQuery: string
): ProviderImageQuery & { sig: number } {
  return {
    ...query,
    textQuery: textQuery.trim() || query.textQuery,
  };
}

export function __resolveProviderQueriesForTests(query: ProviderImageQuery): {
  useSightSources: boolean;
  sightTextQuery: string;
  vibeTextQuery: string;
} {
  return {
    useSightSources: shouldUseSightSources(query),
    sightTextQuery: buildSightQueryText(query),
    vibeTextQuery: buildVibeQueryText(query),
  };
}

async function rerankCandidatesWithLlm(
  candidates: VerifiedCandidate[],
  queryKey: string,
  context: ImageVerificationContext
): Promise<VerifiedCandidate[]> {
  if (!IMAGE_LLM_RERANK_ENABLED) return candidates;

  const eligible = candidates.filter((candidate) => candidate.status !== 'REJECTED');
  if (eligible.length === 0) return candidates;

  const topCandidates = [...eligible]
    .sort((a, b) => b.deterministicScore - a.deterministicScore)
    .slice(0, IMAGE_LLM_MAX_CANDIDATES);

  const batchInput: PlacePhotoBatchInput[] = [
    {
      placeKey: queryKey,
      place: [context.name?.trim() || context.textQuery, context.description]
        .filter(Boolean)
        .join(' - '),
      city: context.city,
      country: context.country,
      category: context.category,
      photos: topCandidates.map((candidate) => ({
        providerImageId: candidate.candidate.providerImageId,
        url: candidate.candidate.url,
        title: candidate.candidate.title,
        description: candidate.candidate.description,
        city: candidate.candidate.city,
        country: candidate.candidate.country,
        tags: candidate.candidate.tags,
      })),
    },
  ];

  const rerankResults = await rerankPlacePhotoBatchesWithLlm(batchInput);
  const scoreMap = new Map(
    rerankResults
      .flatMap((result) => result.scores)
      .map((score) => [score.providerImageId, score] as const)
  );

  if (scoreMap.size === 0) return candidates;

  return candidates.map((candidate) => {
    const llmScore = scoreMap.get(candidate.candidate.providerImageId);
    if (!llmScore) return candidate;

    const blendedFinalScore = clamp01(
      candidate.deterministicScore * DETERMINISTIC_WEIGHT +
        llmScore.relevanceScore * LLM_WEIGHT
    );

    let status = candidate.status;
    if (candidate.status !== 'REJECTED') {
      if (llmScore.relevanceScore >= 0.75 || blendedFinalScore >= 0.76) {
        status = 'VERIFIED';
      } else if (llmScore.relevanceScore < 0.35 && blendedFinalScore < 0.52) {
        status = 'REJECTED';
      } else {
        status = 'REVIEW';
      }
    }

    return {
      ...candidate,
      llmScore: llmScore.relevanceScore,
      finalScore: blendedFinalScore,
      status,
      reasonCodes: uniqueReasonCodes([
        ...candidate.reasonCodes,
        ...llmScore.reasonCodes,
        'llm_batch_rerank',
      ]),
    };
  });
}

function verifyCandidates(
  candidates: ProviderImageCandidate[],
  context: ImageVerificationContext
): VerifiedCandidate[] {
  return candidates.map((candidate) => {
    const verification = verifyImageCandidate(candidate, context);
    return {
      candidate,
      deterministicScore: verification.deterministicScore,
      llmScore: null,
      finalScore: verification.finalScore,
      reasonCodes: verification.reasonCodes,
      status: verification.status,
    };
  });
}

type ScoringMode = 'verified_then_review' | 'llm_threshold';

async function scoreAndPersistCandidates(
  providerName: string,
  candidates: ProviderImageCandidate[],
  queryKey: string,
  placeId: string | undefined,
  context: ImageVerificationContext,
  mode: ScoringMode
): Promise<PlaceImageEntry[]> {
  if (candidates.length === 0) return [];
  if (!IMAGE_VERIFICATION_ENABLED) {
    if (IMAGE_VERIFICATION_DEBUG) {
      console.info(
        `[image-selection] verification disabled; provider=${providerName} query=${queryKey} candidates=${candidates.length}`
      );
    }
    return candidates.map((candidate) => entryFromProviderCandidate(candidate));
  }

  const initialCandidates = verifyCandidates(candidates, context);
  const verifiedCandidates = await rerankCandidatesWithLlm(initialCandidates, queryKey, context);
  logVerificationRanking(providerName, queryKey, context, verifiedCandidates);

  const persisted = await persistVerifiedCandidates(queryKey, placeId, verifiedCandidates);
  if (mode === 'llm_threshold') {
    const accepted = persisted
      .filter((entry) => {
        if (entry.candidate.status === 'REJECTED') return false;
        const llmScore = entry.candidate.llmScore;
        return typeof llmScore === 'number' && llmScore >= IMAGE_LLM_ACCEPT_THRESHOLD;
      })
      .sort((a, b) => b.candidate.finalScore - a.candidate.finalScore);

    if (IMAGE_VERIFICATION_DEBUG) {
      const evaluatedCount = persisted.filter((entry) => entry.candidate.status !== 'REJECTED').length;
      console.info(
        `[image-selection] threshold provider=${providerName} threshold=${IMAGE_LLM_ACCEPT_THRESHOLD.toFixed(2)} evaluated=${evaluatedCount} accepted=${accepted.length}`
      );
    }
    return finalizeAcceptedCandidates(queryKey, placeId, accepted);
  }

  const acceptedVerified = persisted
    .filter((entry) => entry.candidate.status === 'VERIFIED')
    .sort((a, b) => b.candidate.finalScore - a.candidate.finalScore);
  const acceptedReview = persisted
    .filter((entry) => entry.candidate.status === 'REVIEW')
    .sort((a, b) => b.candidate.finalScore - a.candidate.finalScore);
  const accepted = acceptedVerified.length > 0 ? acceptedVerified : acceptedReview;

  return finalizeAcceptedCandidates(queryKey, placeId, accepted);
}

async function fetchVerifiedFromProvider(
  providerName: string,
  fetcher: () => Promise<ProviderImageCandidate[]>,
  queryKey: string,
  placeId: string | undefined,
  context: ImageVerificationContext
): Promise<PlaceImageEntry[]> {
  const candidates = await fetchCandidatesFromProvider(providerName, fetcher);
  return scoreAndPersistCandidates(
    providerName,
    candidates,
    queryKey,
    placeId,
    context,
    'verified_then_review'
  );
}

async function fetchPrimaryProviderCandidates(
  query: ProviderImageQuery & { sig: number },
  timeoutMs?: number
): Promise<PrimaryProviderCandidates> {
  const pexelsKey = resolvePexelsApiKey();
  const unsplashKey = resolveUnsplashAccessKey();
  const useSightSources = shouldUseSightSources(query);
  const sightQuery = withTextQuery(query, buildSightQueryText(query));
  const vibeQuery = withTextQuery(query, buildVibeQueryText(query));

  const [wikipediaCandidates, wikimediaCandidates, pexelsCandidates, unsplashCandidates] =
    await Promise.all([
      useSightSources
        ? fetchCandidatesFromProvider(
            'wikipedia',
            () => searchWikipediaSightCandidates(sightQuery),
            timeoutMs
          )
        : Promise.resolve([]),
      useSightSources
        ? fetchCandidatesFromProvider(
            'wikimedia_commons',
            () => searchWikimediaCommonsCandidates(sightQuery),
            timeoutMs
          )
        : Promise.resolve([]),
      pexelsKey
        ? fetchCandidatesFromProvider(
            'pexels',
            () => searchPexelsCandidates(vibeQuery, pexelsKey),
            timeoutMs
          )
        : Promise.resolve([]),
      unsplashKey
        ? fetchCandidatesFromProvider(
            'unsplash',
            () => searchUnsplashCandidates(vibeQuery, unsplashKey),
            timeoutMs
          )
        : Promise.resolve([]),
    ]);

  return {
    wikipediaCandidates,
    wikimediaCandidates,
    pexelsCandidates,
    unsplashCandidates,
  };
}

async function resolveAndPersistVerifiedCandidates(
  query: ProviderImageQuery & { sig: number },
  queryKey: string,
  context: ImageVerificationContext,
  primaryCandidates: PrimaryProviderCandidates
): Promise<PlaceImageEntry[]> {
  const primaryBatchCandidates = pickPrimaryBatchCandidates([
    primaryCandidates.wikipediaCandidates,
    primaryCandidates.wikimediaCandidates,
    primaryCandidates.unsplashCandidates,
    primaryCandidates.pexelsCandidates,
  ]);
  const totalPrimaryCandidateCount =
    primaryCandidates.wikipediaCandidates.length +
    primaryCandidates.wikimediaCandidates.length +
    primaryCandidates.unsplashCandidates.length +
    primaryCandidates.pexelsCandidates.length;

  const primaryAccepted = await scoreAndPersistCandidates(
    'primary_batch',
    primaryBatchCandidates,
    queryKey,
    query.placeId,
    context,
    'llm_threshold'
  );
  if (primaryAccepted.length > 0) {
    return selectWithSeed(primaryAccepted, query.count, query.sig);
  }

  // Keep Google costs low: only hit Google when non-Google providers
  // yielded zero candidates, not just "no accepted candidates".
  if (totalPrimaryCandidateCount > 0) {
    if (IMAGE_VERIFICATION_DEBUG) {
      console.info(
        `[image-selection] skipping Google fallback for query=${queryKey} because primary candidates were available (${totalPrimaryCandidateCount})`
      );
    }
    return [];
  }

  if (!ENABLE_GOOGLE_TEXT_SEARCH) {
    if (!loggedGoogleTextSearchDisabled) {
      loggedGoogleTextSearchDisabled = true;
      console.info('[image-selection] Google Places Text Search disabled; skipping Google image fallback');
    }
    return [];
  }

  const googleApiKey = resolveGooglePlacesImageApiKey();
  if (googleApiKey) {
    const googleAccepted = await fetchVerifiedFromProvider(
      'google_places',
      () => searchGooglePlacesImageCandidates(query, googleApiKey),
      queryKey,
      query.placeId,
      context
    );
    if (googleAccepted.length > 0) {
      return selectWithSeed(googleAccepted, query.count, query.sig);
    }
  }

  return [];
}

function startBackgroundVerification(
  query: ProviderImageQuery & { sig: number },
  queryKey: string,
  context: ImageVerificationContext,
  primaryCandidates: PrimaryProviderCandidates
): void {
  if (backgroundVerificationInFlight.has(queryKey)) return;
  backgroundVerificationInFlight.add(queryKey);

  void resolveAndPersistVerifiedCandidates(query, queryKey, context, primaryCandidates)
    .catch((error) => {
      console.warn('[image-selection] background verification failed', error);
    })
    .finally(() => {
      backgroundVerificationInFlight.delete(queryKey);
    });
}

export async function resolveVerifiedPlaceImages(query: ProviderImageQuery & { sig: number }): Promise<PlaceImageEntry[]> {
  const queryKey = buildQueryKey(query);

  if (IMAGE_VERIFICATION_ENABLED) {
    const cached = await loadVerifiedAssets(queryKey, query.count);
    if (cached.length > 0) {
      return selectWithSeed(cached, query.count, query.sig).map((asset) => toEntry(asset));
    }
  }

  const context: ImageVerificationContext = {
    textQuery: query.textQuery,
    name: query.name,
    description: query.description,
    city: query.city,
    country: query.country,
    category: query.category,
    requestedWidth: query.width,
    requestedHeight: query.height,
  };

  const primaryCandidates = await fetchPrimaryProviderCandidates(
    query,
    IMAGE_FAST_MODE ? IMAGE_FAST_PROVIDER_TIMEOUT_MS : undefined
  );

  if (IMAGE_FAST_MODE) {
    const fastPathCandidates = buildFastPathCandidatePool([
      primaryCandidates.wikipediaCandidates,
      primaryCandidates.wikimediaCandidates,
      primaryCandidates.unsplashCandidates,
      primaryCandidates.pexelsCandidates,
    ]);

    if (IMAGE_VERIFICATION_ENABLED) {
      startBackgroundVerification(query, queryKey, context, primaryCandidates);
    }

    if (fastPathCandidates.length > 0) {
      return selectWithSeed(fastPathCandidates, query.count, query.sig).map((candidate) =>
        entryFromProviderCandidate(candidate)
      );
    }
    return [];
  }

  return resolveAndPersistVerifiedCandidates(query, queryKey, context, primaryCandidates);
}
