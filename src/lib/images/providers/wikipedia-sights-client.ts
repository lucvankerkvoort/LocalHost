import { callExternalApi } from '@/lib/providers/external-api-gateway';

import type { ProviderImageCandidate, ProviderImageQuery } from './types';

const SEARCH_ENDPOINT = 'https://en.wikipedia.org/w/api.php';
const DEFAULT_LIMIT = 12;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function resolveWikipediaSearchCostMicros(): number {
  return parsePositiveInt(process.env.WIKIPEDIA_SEARCH_COST_MICROS, 1_000);
}

function normalizeText(value?: string | null): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function uniqueTokens(parts: Array<string | undefined>): string[] {
  return Array.from(
    new Set(parts.flatMap((part) => normalizeText(part)))
  );
}

type WikipediaPage = {
  pageid?: number;
  title?: string;
  fullurl?: string;
  extract?: string;
  description?: string;
  thumbnail?: {
    source?: string;
    width?: number;
    height?: number;
  };
};

type WikipediaSearchResponse = {
  query?: {
    pages?: WikipediaPage[];
  };
};

function buildSearchQuery(query: ProviderImageQuery): string {
  const parts = [query.name, query.city, query.country, query.textQuery]
    .map((part) => part?.trim())
    .filter(Boolean) as string[];
  return parts.join(' ');
}

function isLikelyPlaceMatch(page: WikipediaPage, query: ProviderImageQuery): boolean {
  const queryTokens = uniqueTokens([query.name, query.textQuery]);
  const pageTokens = uniqueTokens([page.title, page.extract, page.description]);
  if (queryTokens.length === 0 || pageTokens.length === 0) return false;
  const overlap = queryTokens.filter((token) => pageTokens.includes(token));
  return overlap.length >= 1;
}

export async function searchWikipediaSightCandidates(
  query: ProviderImageQuery
): Promise<ProviderImageCandidate[]> {
  const apiUrl = new URL(SEARCH_ENDPOINT);
  apiUrl.searchParams.set('action', 'query');
  apiUrl.searchParams.set('format', 'json');
  apiUrl.searchParams.set('formatversion', '2');
  apiUrl.searchParams.set('generator', 'search');
  apiUrl.searchParams.set('gsrsearch', buildSearchQuery(query));
  apiUrl.searchParams.set('gsrnamespace', '0');
  apiUrl.searchParams.set('gsrlimit', String(Math.max(DEFAULT_LIMIT, query.count * 3)));
  apiUrl.searchParams.set('prop', 'pageimages|extracts|description|info');
  apiUrl.searchParams.set('piprop', 'thumbnail');
  apiUrl.searchParams.set('pithumbsize', String(Math.min(1200, Math.max(query.width, query.height))));
  apiUrl.searchParams.set('exintro', '1');
  apiUrl.searchParams.set('explaintext', '1');
  apiUrl.searchParams.set('exchars', '220');
  apiUrl.searchParams.set('inprop', 'url');

  const response = await callExternalApi({
    provider: 'WIKIMEDIA_COMMONS',
    endpoint: 'wikipedia.searchPages',
    url: apiUrl.toString(),
    method: 'GET',
    timeoutMs: 7000,
    retries: 1,
    estimatedCostMicros: resolveWikipediaSearchCostMicros(),
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as WikipediaSearchResponse;
  const pages = payload.query?.pages ?? [];

  return pages
    .filter((page) => isLikelyPlaceMatch(page, query))
    .map((page): ProviderImageCandidate | null => {
      const pageId = page.pageid;
      const thumbnailUrl = page.thumbnail?.source;
      if (typeof pageId !== 'number' || !thumbnailUrl) return null;

      const tags = uniqueTokens([
        page.title,
        page.extract,
        page.description,
        query.category,
      ]);

      return {
        provider: 'WIKIMEDIA_COMMONS',
        providerImageId: `wikipedia-${pageId}`,
        url: thumbnailUrl,
        thumbnailUrl,
        width:
          typeof page.thumbnail?.width === 'number'
            ? page.thumbnail.width
            : query.width,
        height:
          typeof page.thumbnail?.height === 'number'
            ? page.thumbnail.height
            : query.height,
        title: page.title ?? undefined,
        description: page.extract ?? page.description ?? undefined,
        tags,
        city: query.city,
        country: query.country,
        attribution: {
          displayName: 'Wikipedia',
          uri: page.fullurl,
        },
        licenseCode: 'WIKIPEDIA_CC_BY_SA',
        photographerName: undefined,
        safeFlag: 'UNKNOWN',
      };
    })
    .filter((candidate): candidate is ProviderImageCandidate => Boolean(candidate));
}
