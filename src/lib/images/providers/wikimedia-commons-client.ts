import { callExternalApi } from '@/lib/providers/external-api-gateway';

import type { ProviderImageCandidate, ProviderImageQuery } from './types';

const SEARCH_ENDPOINT = 'https://commons.wikimedia.org/w/api.php';
const DEFAULT_LIMIT = 18;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function resolveWikimediaSearchCostMicros(): number {
  return parsePositiveInt(process.env.WIKIMEDIA_COMMONS_SEARCH_COST_MICROS, 1_000);
}

function normalizeText(value?: string | null): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function stripHtml(value?: string): string | undefined {
  if (!value) return undefined;
  const stripped = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped || undefined;
}

type WikimediaMetadataField = {
  value?: string;
};

type WikimediaImageInfo = {
  url?: string;
  thumburl?: string;
  width?: number;
  height?: number;
  thumbwidth?: number;
  thumbheight?: number;
  descriptionurl?: string;
  descriptionshorturl?: string;
  extmetadata?: Record<string, WikimediaMetadataField>;
};

type WikimediaPage = {
  pageid?: number;
  title?: string;
  imageinfo?: WikimediaImageInfo[];
};

type WikimediaSearchResponse = {
  query?: {
    pages?: WikimediaPage[];
  };
};

function metadataValue(
  metadata: Record<string, WikimediaMetadataField> | undefined,
  key: string
): string | undefined {
  return stripHtml(metadata?.[key]?.value);
}

function titleToTokens(title?: string): string[] {
  if (!title) return [];
  const cleaned = title.replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '');
  return normalizeText(cleaned);
}

function buildSearchQuery(query: ProviderImageQuery): string {
  const parts = [query.textQuery, query.city, query.country].filter(Boolean);
  return `${parts.join(' ')} filetype:bitmap`;
}

export async function searchWikimediaCommonsCandidates(
  query: ProviderImageQuery
): Promise<ProviderImageCandidate[]> {
  const apiUrl = new URL(SEARCH_ENDPOINT);
  apiUrl.searchParams.set('action', 'query');
  apiUrl.searchParams.set('format', 'json');
  apiUrl.searchParams.set('formatversion', '2');
  apiUrl.searchParams.set('generator', 'search');
  apiUrl.searchParams.set('gsrsearch', buildSearchQuery(query));
  apiUrl.searchParams.set('gsrnamespace', '6');
  apiUrl.searchParams.set('gsrlimit', String(Math.max(DEFAULT_LIMIT, query.count * 3)));
  apiUrl.searchParams.set('gsrwhat', 'text');
  apiUrl.searchParams.set('prop', 'imageinfo');
  apiUrl.searchParams.set('iiprop', 'url|size|extmetadata');
  apiUrl.searchParams.set('iiurlwidth', String(query.width));
  apiUrl.searchParams.set('iiurlheight', String(query.height));

  const response = await callExternalApi({
    provider: 'WIKIMEDIA_COMMONS',
    endpoint: 'wikimedia.searchImages',
    url: apiUrl.toString(),
    method: 'GET',
    timeoutMs: 7000,
    retries: 1,
    estimatedCostMicros: resolveWikimediaSearchCostMicros(),
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as WikimediaSearchResponse;
  const pages = payload.query?.pages ?? [];

  return pages
    .map((page): ProviderImageCandidate | null => {
      const info = page.imageinfo?.[0];
      if (!info) return null;

      const providerImageId = String(page.pageid ?? page.title ?? '');
      if (!providerImageId) return null;

      const url = info.thumburl ?? info.url;
      if (!url) return null;

      const metadata = info.extmetadata;
      const artist = metadataValue(metadata, 'Artist');
      const objectName = metadataValue(metadata, 'ObjectName');
      const description = metadataValue(metadata, 'ImageDescription');
      const categories = metadataValue(metadata, 'Categories');
      const licenseUrl = metadataValue(metadata, 'LicenseUrl');

      const tags = Array.from(
        new Set([
          ...titleToTokens(page.title),
          ...normalizeText(objectName),
          ...normalizeText(description),
          ...normalizeText(categories),
          ...normalizeText(query.category),
        ])
      );

      return {
        provider: 'WIKIMEDIA_COMMONS',
        providerImageId,
        url,
        thumbnailUrl: info.thumburl ?? info.url,
        width:
          typeof info.thumbwidth === 'number'
            ? info.thumbwidth
            : typeof info.width === 'number'
              ? info.width
              : query.width,
        height:
          typeof info.thumbheight === 'number'
            ? info.thumbheight
            : typeof info.height === 'number'
              ? info.height
              : query.height,
        title: objectName ?? stripHtml(page.title) ?? undefined,
        description,
        tags,
        city: query.city,
        country: query.country,
        attribution: {
          displayName: artist,
          uri: licenseUrl ?? info.descriptionshorturl ?? info.descriptionurl,
        },
        licenseCode: 'WIKIMEDIA_COMMONS_LICENSE',
        photographerName: artist,
        safeFlag: 'UNKNOWN',
      };
    })
    .filter((candidate): candidate is ProviderImageCandidate => Boolean(candidate));
}
