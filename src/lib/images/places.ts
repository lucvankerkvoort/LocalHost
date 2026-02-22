const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 400;

export const PLACE_IMAGE_FALLBACK = '/globe.svg';

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

export function buildPlaceImageUrl(params: {
  name?: string;
  city?: string;
  category?: string;
  width?: number;
  height?: number;
}): string | undefined {
  const query = buildQuery([params.name, params.city, params.category]);
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
  if (params.name) searchParams.set('name', params.name);
  if (params.city) searchParams.set('city', params.city);
  if (params.category) searchParams.set('category', params.category);
  return `/api/images/places?${searchParams.toString()}`;
}

export function buildPlaceImageListUrl(params: {
  name?: string;
  city?: string;
  category?: string;
  count?: number;
  width?: number;
  height?: number;
}): string | undefined {
  const query = buildQuery([params.name, params.city, params.category]);
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
  if (params.name) searchParams.set('name', params.name);
  if (params.city) searchParams.set('city', params.city);
  if (params.category) searchParams.set('category', params.category);
  return `/api/images/places/list?${searchParams.toString()}`;
}
