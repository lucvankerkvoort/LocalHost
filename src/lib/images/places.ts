const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 400;

export const PLACE_IMAGE_FALLBACK = '/globe.svg';

function parseEnabledFlag(raw: string | undefined): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function isPlaceImagesEnabled(): boolean {
  return parseEnabledFlag(process.env.NEXT_PUBLIC_ENABLE_PLACE_IMAGES);
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildQuery(parts: Array<string | undefined | null>): string | undefined {
  const queryParts = parts
    .map((part) => part?.trim())
    .filter(Boolean) as string[];
  if (queryParts.length === 0) return undefined;
  return queryParts.join(' ');
}

function compactDescription(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .replace(/[-–—/\\|]+/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return undefined;
  const words = normalized.split(' ');
  return words.slice(0, 10).join(' ');
}

export function buildPlaceImageUrl(params: {
  placeId?: string;
  name?: string;
  description?: string;
  city?: string;
  country?: string;
  category?: string;
  placeId?: string;
  width?: number;
  height?: number;
}): string | undefined {
  if (!isPlaceImagesEnabled()) return undefined;
  const query = buildQuery([
    params.name,
    params.city,
    params.country,
    params.category,
    compactDescription(params.description),
  ]);
  if (!query) return undefined;
  const width = params.width ?? DEFAULT_WIDTH;
  const height = params.height ?? DEFAULT_HEIGHT;
  const sig = hashString(`${query}-${width}x${height}`) % 1000;
  const searchParams = new URLSearchParams({
    query,
    w: String(width),
    h: String(height),
    sig: String(sig),
  });
  if (params.placeId) searchParams.set('placeId', params.placeId);
  if (params.name) searchParams.set('name', params.name);
  const compactedDescription = compactDescription(params.description);
  if (compactedDescription) searchParams.set('description', compactedDescription);
  if (params.city) searchParams.set('city', params.city);
  if (params.country) searchParams.set('country', params.country);
  if (params.category) searchParams.set('category', params.category);
  if (params.placeId) searchParams.set('placeId', params.placeId);
  return `/api/images/places?${searchParams.toString()}`;
}

export function buildPlaceImageListUrl(params: {
  itemId?: string;
  placeId?: string;
  name?: string;
  description?: string;
  city?: string;
  country?: string;
  category?: string;
  placeId?: string;
  count?: number;
  width?: number;
  height?: number;
}): string | undefined {
  if (!isPlaceImagesEnabled()) return undefined;
  const query = buildQuery([
    params.name,
    params.city,
    params.country,
    params.category,
    compactDescription(params.description),
  ]);
  if (!query) return undefined;
  const width = params.width ?? DEFAULT_WIDTH;
  const height = params.height ?? DEFAULT_HEIGHT;
  const sig = hashString(`${query}-${width}x${height}`) % 1000;
  const searchParams = new URLSearchParams({
    query,
    w: String(width),
    h: String(height),
    sig: String(sig),
    count: String(params.count ?? 5),
  });
  if (params.itemId) searchParams.set('itemId', params.itemId);
  if (params.placeId) searchParams.set('placeId', params.placeId);
  if (params.name) searchParams.set('name', params.name);
  const compactedDescription = compactDescription(params.description);
  if (compactedDescription) searchParams.set('description', compactedDescription);
  if (params.city) searchParams.set('city', params.city);
  if (params.country) searchParams.set('country', params.country);
  if (params.category) searchParams.set('category', params.category);
  if (params.placeId) searchParams.set('placeId', params.placeId);
  return `/api/images/places/list?${searchParams.toString()}`;
}
