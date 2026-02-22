import { NextResponse } from 'next/server';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=600&h=400&q=80';
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const MAX_CACHE_ENTRIES = 500;

type CacheEntry = {
  images: string[];
  expiresAt: number;
};

const responseCache = new Map<string, CacheEntry>();

function clampDimension(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function getCacheKey(query: string, width: number, height: number, sig: number, count: number) {
  return `${query}|${width}x${height}|${sig}|${count}`;
}

function sanitizeQuery(value: string): string {
  const withoutParens = value.replace(/\([^)]*\)/g, ' ');
  const normalized = withoutParens
    .replace(/[-–—/\\|]+/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  const words = normalized.split(' ');
  return words.length > 6 ? words.slice(0, 6).join(' ') : normalized;
}

function buildCandidateQueries(input: {
  query: string;
  name?: string | null;
  city?: string | null;
  category?: string | null;
}): string[] {
  const queries = new Set<string>();
  const normalizedName = sanitizeQuery(input.name ?? '').toLowerCase();
  const normalizedCity = sanitizeQuery(input.city ?? '').toLowerCase();
  const normalizedCategory = sanitizeQuery(input.category ?? '').toLowerCase();
  const genericTerms = new Set([
    'breakfast',
    'lunch',
    'dinner',
    'coffee',
    'drinks',
    'snack',
    'hotel',
    'check in',
    'check out',
    'free time',
    'relax',
    'rest',
    'walk',
    'drive',
    'train',
    'flight',
    'arrival',
    'depart',
    'departure',
    'travel',
    'transport',
    'explore',
    'shopping',
  ]);
  const nameIsGeneric =
    !normalizedName ||
    genericTerms.has(normalizedName) ||
    normalizedName.split(' ').every((token) => genericTerms.has(token));
  const add = (value?: string | null) => {
    if (!value) return;
    const cleaned = sanitizeQuery(value);
    if (cleaned) queries.add(cleaned);
  };

  if (!nameIsGeneric) {
    add([input.name, input.city].filter(Boolean).join(' '));
    add(input.name ?? '');
  } else {
    add([input.category, input.city].filter(Boolean).join(' '));
  }

  add(input.query);
  if (normalizedCategory) {
    add([input.category, input.city].filter(Boolean).join(' '));
    add(input.category ?? '');
  }
  if (normalizedCity) {
    add(input.city ?? '');
  }

  return Array.from(queries).slice(0, 4);
}

async function searchUnsplash(query: string, accessKey: string, page: number) {
  const apiUrl = new URL('https://api.unsplash.com/search/photos');
  apiUrl.searchParams.set('query', query);
  apiUrl.searchParams.set('per_page', '30');
  apiUrl.searchParams.set('page', String(page));
  apiUrl.searchParams.set('orientation', 'landscape');
  apiUrl.searchParams.set('content_filter', 'high');

  try {
    const response = await fetch(apiUrl.toString(), {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        'Accept-Version': 'v1',
      },
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      results?: Array<{ urls?: { raw?: string; regular?: string; small?: string } }>;
    };

    return payload.results ?? [];
  } catch (error) {
    console.error('[unsplash] list search failed', error);
    return [];
  }
}

function scoreResult(
  result: {
    alt_description?: string | null;
    description?: string | null;
    tags?: Array<{ title?: string }>;
  },
  tokens: { name: string[]; city: string[]; category: string[] }
): number {
  const textParts: string[] = [];
  if (result.alt_description) textParts.push(result.alt_description);
  if (result.description) textParts.push(result.description);
  if (Array.isArray(result.tags)) {
    result.tags.forEach((tag) => {
      if (tag.title) textParts.push(tag.title);
    });
  }
  const text = textParts.join(' ').toLowerCase();
  let score = 0;
  tokens.name.forEach((token) => {
    if (text.includes(token)) score += 3;
  });
  tokens.city.forEach((token) => {
    if (text.includes(token)) score += 2;
  });
  tokens.category.forEach((token) => {
    if (text.includes(token)) score += 1;
  });
  return score;
}

function pruneCache() {
  if (responseCache.size <= MAX_CACHE_ENTRIES) return;
  const entries = Array.from(responseCache.entries());
  entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  const toRemove = entries.slice(0, Math.max(0, entries.length - MAX_CACHE_ENTRIES));
  for (const [key] of toRemove) {
    responseCache.delete(key);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get('query') || searchParams.get('q') || '';
  const query = rawQuery.trim();
  const name = searchParams.get('name');
  const city = searchParams.get('city');
  const category = searchParams.get('category');
  const width = clampDimension(Number(searchParams.get('w') ?? 600), 200, 1600);
  const height = clampDimension(Number(searchParams.get('h') ?? 400), 200, 1600);
  const sig = Number(searchParams.get('sig') ?? 0);
  const count = clampDimension(Number(searchParams.get('count') ?? 5), 1, 10);

  if (!query && !name && !city && !category) {
    return NextResponse.json({ images: [FALLBACK_IMAGE] });
  }

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return NextResponse.json({ images: [FALLBACK_IMAGE] });
  }

  const cacheKey = getCacheKey(query, width, height, sig, count);
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ images: cached.images });
  }

  const page = sig > 0 ? (sig % 5) + 1 : 1;
  const candidateQueries = buildCandidateQueries({ query, name, city, category });
  let results: Array<{
    urls?: { raw?: string; regular?: string; small?: string };
    alt_description?: string | null;
    description?: string | null;
    tags?: Array<{ title?: string }>;
  }> = [];

  for (const candidate of candidateQueries) {
    results = await searchUnsplash(candidate, accessKey, page);
    if (results.length > 0) break;
  }

  if (results.length === 0) {
    return NextResponse.json({ images: [FALLBACK_IMAGE] });
  }

  const nameTokens = sanitizeQuery(name ?? query)
    .toLowerCase()
    .split(' ')
    .filter((token) => token.length >= 3);
  const cityTokens = sanitizeQuery(city ?? '')
    .toLowerCase()
    .split(' ')
    .filter((token) => token.length >= 3);
  const categoryTokens = sanitizeQuery(category ?? '')
    .toLowerCase()
    .split(' ')
    .filter((token) => token.length >= 3);

  const scored = results
    .map((result) => ({
      result,
      score: scoreResult(result, {
        name: nameTokens,
        city: cityTokens,
        category: categoryTokens,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  const candidates = scored.some((entry) => entry.score > 0)
    ? scored.filter((entry) => entry.score > 0).map((entry) => entry.result)
    : results;

  const images: string[] = [];
  const startIndex = sig > 0 ? sig % candidates.length : 0;

  for (let i = 0; i < candidates.length && images.length < count; i += 1) {
    const idx = (startIndex + i) % candidates.length;
    const match = candidates[idx];
    const baseUrl = match.urls?.raw || match.urls?.regular || match.urls?.small;
    if (!baseUrl) continue;

    const imageUrl = new URL(baseUrl);
    imageUrl.searchParams.set('w', String(width));
    imageUrl.searchParams.set('h', String(height));
    imageUrl.searchParams.set('fit', 'crop');
    imageUrl.searchParams.set('crop', 'entropy');
    imageUrl.searchParams.set('auto', 'format');
    imageUrl.searchParams.set('q', '80');
    imageUrl.searchParams.set('utm_source', process.env.UNSPLASH_APP_NAME || 'localhost');
    imageUrl.searchParams.set('utm_medium', 'referral');

    images.push(imageUrl.toString());
  }

  if (images.length === 0) {
    images.push(FALLBACK_IMAGE);
  }

  responseCache.set(cacheKey, {
    images,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  pruneCache();

  return NextResponse.json({ images });
}
