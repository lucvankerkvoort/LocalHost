import type { ImageVerificationStatus } from '@prisma/client';

import type { ProviderImageCandidate } from './providers/types';

export type ImageVerificationContext = {
  textQuery: string;
  name?: string;
  description?: string;
  city?: string;
  country?: string;
  category?: string;
  requestedWidth: number;
  requestedHeight: number;
};

export type ImageVerificationResult = {
  status: ImageVerificationStatus;
  deterministicScore: number;
  finalScore: number;
  llmScore: null;
  reasonCodes: string[];
  componentScores: {
    nameMatch: number;
    locationMatch: number;
    categoryMatch: number;
    qualityScore: number;
    specificityScore: number;
  };
};

const ALLOWED_LICENSE_CODES = new Set([
  'UNSPLASH_LICENSE',
  'PEXELS_LICENSE',
  'WIKIMEDIA_COMMONS_LICENSE',
  'GOOGLE_ATTRIBUTION_REQUIRED',
]);

const GENERIC_TOKENS = new Set([
  'travel',
  'vacation',
  'tourism',
  'destination',
  'people',
  'lifestyle',
  'summer',
  'holiday',
  'trip',
  'explore',
]);

const CATEGORY_LEXICON: Record<string, string[]> = {
  landmark: ['landmark', 'monument', 'historic', 'architecture', 'sightseeing'],
  museum: ['museum', 'gallery', 'exhibit', 'art', 'history'],
  restaurant: ['restaurant', 'food', 'dining', 'meal', 'cafe', 'bar'],
  park: ['park', 'garden', 'nature', 'outdoor', 'green'],
  neighborhood: ['neighborhood', 'district', 'street', 'local'],
  city: ['city', 'urban', 'downtown'],
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeText(value?: string | null): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function buildTokenSet(parts: Array<string | undefined>): Set<string> {
  return new Set(parts.flatMap((part) => normalizeText(part)));
}

function overlapScore(target: Set<string>, candidate: Set<string>, neutralWhenEmpty = 0): number {
  if (target.size === 0) return neutralWhenEmpty;
  let hits = 0;
  for (const token of target) {
    if (candidate.has(token)) hits += 1;
  }
  return clamp01(hits / target.size);
}

function computeQualityScore(candidate: ProviderImageCandidate, context: ImageVerificationContext): number {
  const width = Math.max(1, candidate.width);
  const height = Math.max(1, candidate.height);
  const resolutionScore = clamp01((width * height) / (context.requestedWidth * context.requestedHeight));

  const targetAspect = context.requestedWidth / Math.max(1, context.requestedHeight);
  const actualAspect = width / height;
  const aspectDelta = Math.abs(targetAspect - actualAspect);
  const aspectScore = clamp01(1 - aspectDelta / Math.max(0.25, targetAspect));

  return clamp01(resolutionScore * 0.7 + aspectScore * 0.3);
}

function computeSpecificityScore(candidateTokens: Set<string>): number {
  if (candidateTokens.size === 0) return 0;

  let genericCount = 0;
  for (const token of candidateTokens) {
    if (GENERIC_TOKENS.has(token)) genericCount += 1;
  }

  const genericRatio = genericCount / candidateTokens.size;
  return clamp01(1 - genericRatio);
}

function buildCategoryTarget(category?: string): Set<string> {
  const normalized = (category ?? '').toLowerCase().trim();
  const lexicon = CATEGORY_LEXICON[normalized] ?? [];
  return buildTokenSet([normalized, ...lexicon]);
}

export function verifyImageCandidate(
  candidate: ProviderImageCandidate,
  context: ImageVerificationContext
): ImageVerificationResult {
  const reasonCodes: string[] = [];

  const hasAttribution = Boolean(
    candidate.attribution.displayName || candidate.attribution.uri || candidate.photographerName
  );
  if (!hasAttribution) {
    return {
      status: 'REJECTED',
      deterministicScore: 0,
      finalScore: 0,
      llmScore: null,
      reasonCodes: ['missing_attribution'],
      componentScores: {
        nameMatch: 0,
        locationMatch: 0,
        categoryMatch: 0,
        qualityScore: 0,
        specificityScore: 0,
      },
    };
  }

  if (!ALLOWED_LICENSE_CODES.has(candidate.licenseCode)) {
    return {
      status: 'REJECTED',
      deterministicScore: 0,
      finalScore: 0,
      llmScore: null,
      reasonCodes: ['license_disallowed'],
      componentScores: {
        nameMatch: 0,
        locationMatch: 0,
        categoryMatch: 0,
        qualityScore: 0,
        specificityScore: 0,
      },
    };
  }

  if (candidate.safeFlag === 'UNSAFE') {
    return {
      status: 'REJECTED',
      deterministicScore: 0,
      finalScore: 0,
      llmScore: null,
      reasonCodes: ['unsafe_content'],
      componentScores: {
        nameMatch: 0,
        locationMatch: 0,
        categoryMatch: 0,
        qualityScore: 0,
        specificityScore: 0,
      },
    };
  }

  const candidateTokens = buildTokenSet([
    candidate.title,
    candidate.description,
    candidate.tags.join(' '),
    candidate.city,
    candidate.country,
  ]);

  const nameTarget = buildTokenSet([context.name, context.textQuery, context.description]);
  const locationTarget = buildTokenSet([context.city, context.country]);
  const categoryTarget = buildCategoryTarget(context.category);

  const nameMatch = overlapScore(nameTarget, candidateTokens, 0);
  const locationMatch = overlapScore(locationTarget, candidateTokens, 0.5);
  const categoryMatch = overlapScore(categoryTarget, candidateTokens, 0.5);
  const qualityScore = computeQualityScore(candidate, context);
  const specificityScore = computeSpecificityScore(candidateTokens);

  const deterministicScore = clamp01(
    0.55 * nameMatch +
      0.25 * locationMatch +
      0.15 * categoryMatch +
      0.03 * qualityScore +
      0.02 * specificityScore
  );

  let status: ImageVerificationStatus;
  if (deterministicScore >= 0.82) {
    status = 'VERIFIED';
    reasonCodes.push('deterministic_accept');
  } else if (deterministicScore < 0.45) {
    status = 'REJECTED';
    reasonCodes.push('deterministic_reject');
  } else {
    status = 'REVIEW';
    reasonCodes.push('review_required');
  }

  return {
    status,
    deterministicScore,
    finalScore: deterministicScore,
    llmScore: null,
    reasonCodes,
    componentScores: {
      nameMatch,
      locationMatch,
      categoryMatch,
      qualityScore,
      specificityScore,
    },
  };
}
