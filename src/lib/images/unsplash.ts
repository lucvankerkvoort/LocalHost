const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 400;

export const UNSPLASH_FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=600&h=400&q=80';

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function buildUnsplashImageUrl(
  query: string,
  options?: {
    width?: number;
    height?: number;
    meta?: { name?: string; city?: string; category?: string };
  }
): string | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  const width = options?.width ?? DEFAULT_WIDTH;
  const height = options?.height ?? DEFAULT_HEIGHT;
  const sig = hashString(`${trimmed}-${width}x${height}`) % 1000;
  const params = new URLSearchParams({
    query: trimmed,
    w: String(width),
    h: String(height),
    sig: String(sig),
  });
  const meta = options?.meta;
  if (meta?.name) params.set('name', meta.name);
  if (meta?.city) params.set('city', meta.city);
  if (meta?.category) params.set('category', meta.category);
  return `/api/images/unsplash?${params.toString()}`;
}

export function buildItineraryImageUrl(params: {
  name?: string;
  city?: string;
  category?: string;
  width?: number;
  height?: number;
}): string | undefined {
  const queryParts = [params.name, params.city, params.category]
    .map((part) => part?.trim())
    .filter(Boolean) as string[];
  if (queryParts.length === 0) return undefined;
  const query = queryParts.join(' ');
  return buildUnsplashImageUrl(query, {
    width: params.width,
    height: params.height,
    meta: {
      name: params.name,
      city: params.city,
      category: params.category,
    },
  });
}

export function buildItineraryImageListUrl(params: {
  name?: string;
  city?: string;
  category?: string;
  count?: number;
  width?: number;
  height?: number;
}): string | undefined {
  const queryParts = [params.name, params.city, params.category]
    .map((part) => part?.trim())
    .filter(Boolean) as string[];
  if (queryParts.length === 0) return undefined;
  const query = queryParts.join(' ');
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
  return `/api/images/unsplash/list?${searchParams.toString()}`;
}
