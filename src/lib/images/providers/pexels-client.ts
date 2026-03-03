import { callExternalApi } from '@/lib/providers/external-api-gateway';

import type { ProviderImageCandidate, ProviderImageQuery } from './types';

const SEARCH_ENDPOINT = 'https://api.pexels.com/v1/search';
const DEFAULT_PER_PAGE = 18;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function resolvePexelsSearchCostMicros(): number {
  return parsePositiveInt(process.env.PEXELS_SEARCH_COST_MICROS, 4_000);
}

function normalizeText(value?: string | null): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

export function resolvePexelsApiKey(): string | null {
  const key = process.env.PEXELS_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

type PexelsPhoto = {
  id?: number;
  width?: number;
  height?: number;
  alt?: string;
  url?: string;
  photographer?: string;
  photographer_url?: string;
  src?: {
    original?: string;
    large2x?: string;
    large?: string;
    medium?: string;
    small?: string;
  };
};

type PexelsSearchResponse = {
  photos?: PexelsPhoto[];
};

export async function searchPexelsCandidates(
  query: ProviderImageQuery,
  apiKey: string
): Promise<ProviderImageCandidate[]> {
  const apiUrl = new URL(SEARCH_ENDPOINT);
  apiUrl.searchParams.set('query', query.textQuery);
  apiUrl.searchParams.set('per_page', String(Math.max(DEFAULT_PER_PAGE, query.count * 3)));
  apiUrl.searchParams.set('orientation', 'landscape');

  const response = await callExternalApi({
    provider: 'PEXELS',
    endpoint: 'pexels.searchPhotos',
    url: apiUrl.toString(),
    method: 'GET',
    headers: {
      Authorization: apiKey,
    },
    timeoutMs: 7000,
    retries: 1,
    estimatedCostMicros: resolvePexelsSearchCostMicros(),
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as PexelsSearchResponse;
  const photos = payload.photos ?? [];

  return photos
    .map((photo): ProviderImageCandidate | null => {
      if (typeof photo.id !== 'number') return null;
      const providerImageId = String(photo.id);
      const baseUrl = photo.src?.large2x ?? photo.src?.large ?? photo.src?.original ?? photo.src?.medium;
      if (!baseUrl) return null;

      const tags = Array.from(
        new Set([
          ...normalizeText(photo.alt),
          ...normalizeText(query.category),
          ...normalizeText(query.name),
        ])
      );

      return {
        provider: 'PEXELS',
        providerImageId,
        url: baseUrl,
        thumbnailUrl: photo.src?.small ?? photo.src?.medium,
        width: typeof photo.width === 'number' ? photo.width : query.width,
        height: typeof photo.height === 'number' ? photo.height : query.height,
        title: photo.alt ?? undefined,
        description: photo.alt ?? undefined,
        tags,
        city: query.city,
        country: query.country,
        attribution: {
          displayName: photo.photographer,
          uri: photo.photographer_url,
        },
        licenseCode: 'PEXELS_LICENSE',
        photographerName: photo.photographer,
        safeFlag: 'UNKNOWN',
      };
    })
    .filter((candidate): candidate is ProviderImageCandidate => Boolean(candidate));
}
