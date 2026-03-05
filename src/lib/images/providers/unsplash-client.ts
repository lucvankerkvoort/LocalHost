import { callExternalApi } from '@/lib/providers/external-api-gateway';

import type { ProviderImageCandidate, ProviderImageQuery } from './types';

const SEARCH_ENDPOINT = 'https://api.unsplash.com/search/photos';
const DEFAULT_PER_PAGE = 18;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function resolveUnsplashSearchCostMicros(): number {
  return parsePositiveInt(process.env.UNSPLASH_SEARCH_COST_MICROS, 4_000);
}

function normalizeText(value?: string | null): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

export function resolveUnsplashAccessKey(): string | null {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

type UnsplashPhoto = {
  id?: string;
  width?: number;
  height?: number;
  alt_description?: string | null;
  description?: string | null;
  tags?: Array<{ title?: string }>;
  urls?: {
    raw?: string;
    regular?: string;
    small?: string;
  };
  user?: {
    name?: string;
    links?: {
      html?: string;
    };
  };
};

type UnsplashSearchResponse = {
  results?: UnsplashPhoto[];
};

function buildSizedUrl(baseUrl: string, width: number, height: number): string {
  const url = new URL(baseUrl);
  url.searchParams.set('w', String(width));
  url.searchParams.set('h', String(height));
  url.searchParams.set('fit', 'crop');
  url.searchParams.set('crop', 'entropy');
  url.searchParams.set('auto', 'format');
  url.searchParams.set('q', '80');
  url.searchParams.set('utm_source', process.env.UNSPLASH_APP_NAME || 'localhost');
  url.searchParams.set('utm_medium', 'referral');
  return url.toString();
}

export async function searchUnsplashCandidates(
  query: ProviderImageQuery,
  accessKey: string
): Promise<ProviderImageCandidate[]> {
  const apiUrl = new URL(SEARCH_ENDPOINT);
  apiUrl.searchParams.set('query', query.textQuery);
  apiUrl.searchParams.set('per_page', String(Math.max(DEFAULT_PER_PAGE, query.count * 3)));
  apiUrl.searchParams.set('orientation', 'landscape');
  apiUrl.searchParams.set('content_filter', 'high');

  const response = await callExternalApi({
    provider: 'UNSPLASH',
    endpoint: 'unsplash.searchPhotos',
    url: apiUrl.toString(),
    method: 'GET',
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      'Accept-Version': 'v1',
    },
    timeoutMs: 7000,
    retries: 1,
    estimatedCostMicros: resolveUnsplashSearchCostMicros(),
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as UnsplashSearchResponse;
  const results = payload.results ?? [];

  return results
    .map((photo): ProviderImageCandidate | null => {
      const providerImageId = photo.id;
      const baseUrl = photo.urls?.raw ?? photo.urls?.regular ?? photo.urls?.small;
      if (!providerImageId || !baseUrl) return null;

      const tags = Array.from(
        new Set([
          ...normalizeText(photo.alt_description),
          ...normalizeText(photo.description),
          ...(photo.tags ?? [])
            .map((tag) => tag.title)
            .flatMap((title) => normalizeText(title)),
        ])
      );

      return {
        provider: 'UNSPLASH',
        providerImageId,
        url: buildSizedUrl(baseUrl, query.width, query.height),
        thumbnailUrl: photo.urls?.small,
        width: typeof photo.width === 'number' ? photo.width : query.width,
        height: typeof photo.height === 'number' ? photo.height : query.height,
        title: photo.alt_description ?? undefined,
        description: photo.description ?? undefined,
        tags,
        city: query.city,
        country: query.country,
        attribution: {
          displayName: photo.user?.name,
          uri: photo.user?.links?.html,
        },
        licenseCode: 'UNSPLASH_LICENSE',
        photographerName: photo.user?.name,
        safeFlag: 'SAFE',
      };
    })
    .filter((candidate): candidate is ProviderImageCandidate => Boolean(candidate));
}
