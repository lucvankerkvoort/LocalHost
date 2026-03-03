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

const IMAGE_ASSET_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const IMAGE_SELECTION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const VERIFICATION_VERSION = 'v2-llm-batch';
const ENABLE_GOOGLE_TEXT_SEARCH = process.env.ENABLE_GOOGLE_TEXT_SEARCH === 'true';
const IMAGE_LLM_RERANK_ENABLED = (() => {
  const raw = process.env.IMAGE_LLM_RERANK_ENABLED?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return process.env.NODE_ENV !== 'test';
})();
const IMAGE_LLM_MAX_CANDIDATES = 15;
const DETERMINISTIC_WEIGHT = 0.6;
const LLM_WEIGHT = 0.4;
const PRIMARY_PROVIDER_BATCH_SIZE = 3;
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

export type PlaceImageAttribution = {
  displayName?: string;
  uri?: string;
};

export type PlaceImageEntry = {
  url: string;
  attribution?: PlaceImageAttribution;
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
        placeId: null,
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

async function persistSelection(queryKey: string, assetId: string, provider: ProviderImageCandidate['provider']) {
  if (!imagePersistenceEnabled) return;

  try {
    await prisma.placeImageSelection.upsert({
      where: { queryKey },
      create: {
        queryKey,
        placeId: null,
        assetId,
        provider,
        expiresAt: new Date(Date.now() + IMAGE_SELECTION_TTL_MS),
      },
      update: {
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
  verifiedCandidates: VerifiedCandidate[]
): Promise<PersistedCandidate[]> {
  return Promise.all(
    verifiedCandidates.map(async (candidate) => ({
      candidate,
      asset: await persistCandidate(queryKey, candidate),
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

async function finalizeAcceptedCandidates(
  queryKey: string,
  accepted: PersistedCandidate[]
): Promise<PlaceImageEntry[]> {
  if (accepted.length === 0) return [];

  const winner = accepted[0];
  if (winner.asset) {
    await persistSelection(queryKey, winner.asset.id, winner.candidate.candidate.provider);
  }

  return accepted.map((entry) => {
    if (entry.asset) return toEntry(entry.asset);
    return entryFromCandidate(entry.candidate);
  });
}

async function fetchCandidatesFromProvider(
  providerName: string,
  fetcher: () => Promise<ProviderImageCandidate[]>
): Promise<ProviderImageCandidate[]> {
  try {
    return await fetcher();
  } catch (error) {
    if (error instanceof ExternalApiBudgetExceededError) {
      console.warn(`[image-selection] ${providerName} skipped due to budget cap`);
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
  context: ImageVerificationContext,
  mode: ScoringMode
): Promise<PlaceImageEntry[]> {
  if (candidates.length === 0) return [];

  const initialCandidates = verifyCandidates(candidates, context);
  const verifiedCandidates = await rerankCandidatesWithLlm(initialCandidates, queryKey, context);
  logVerificationRanking(providerName, queryKey, context, verifiedCandidates);

  const persisted = await persistVerifiedCandidates(queryKey, verifiedCandidates);
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
    return finalizeAcceptedCandidates(queryKey, accepted);
  }

  const acceptedVerified = persisted
    .filter((entry) => entry.candidate.status === 'VERIFIED')
    .sort((a, b) => b.candidate.finalScore - a.candidate.finalScore);
  const acceptedReview = persisted
    .filter((entry) => entry.candidate.status === 'REVIEW')
    .sort((a, b) => b.candidate.finalScore - a.candidate.finalScore);
  const accepted = acceptedVerified.length > 0 ? acceptedVerified : acceptedReview;

  return finalizeAcceptedCandidates(queryKey, accepted);
}

async function fetchVerifiedFromProvider(
  providerName: string,
  fetcher: () => Promise<ProviderImageCandidate[]>,
  queryKey: string,
  context: ImageVerificationContext
): Promise<PlaceImageEntry[]> {
  const candidates = await fetchCandidatesFromProvider(providerName, fetcher);
  return scoreAndPersistCandidates(
    providerName,
    candidates,
    queryKey,
    context,
    'verified_then_review'
  );
}

export async function resolveVerifiedPlaceImages(query: ProviderImageQuery & { sig: number }): Promise<PlaceImageEntry[]> {
  const queryKey = buildQueryKey(query);

  const cached = await loadVerifiedAssets(queryKey, query.count);
  if (cached.length > 0) {
    return selectWithSeed(cached, query.count, query.sig).map((asset) => toEntry(asset));
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

  const wikimediaCandidates = await fetchCandidatesFromProvider(
    'wikimedia_commons',
    () => searchWikimediaCommonsCandidates(query)
  );
  const pexelsKey = resolvePexelsApiKey();
  const pexelsCandidates = pexelsKey
    ? await fetchCandidatesFromProvider('pexels', () => searchPexelsCandidates(query, pexelsKey))
    : [];
  const unsplashKey = resolveUnsplashAccessKey();
  const unsplashCandidates = unsplashKey
    ? await fetchCandidatesFromProvider('unsplash', () => searchUnsplashCandidates(query, unsplashKey))
    : [];

  const primaryBatchCandidates = pickPrimaryBatchCandidates([
    wikimediaCandidates,
    pexelsCandidates,
    unsplashCandidates,
  ]);

  const primaryAccepted = await scoreAndPersistCandidates(
    'primary_batch',
    primaryBatchCandidates,
    queryKey,
    context,
    'llm_threshold'
  );
  if (primaryAccepted.length > 0) {
    return selectWithSeed(primaryAccepted, query.count, query.sig);
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
      context
    );
    if (googleAccepted.length > 0) {
      return selectWithSeed(googleAccepted, query.count, query.sig);
    }
  }

  return [];
}
