import { NextResponse } from 'next/server';

import {
  buildTextQuery,
  fallbackImageUrl,
  parseDimensions,
} from './utils';
import { rateLimit } from '@/lib/api/rate-limit';
import { authorizeImageRequest } from '@/lib/images/request-auth';
import {
  isImageFastModeEnabled,
  resolveVerifiedPlaceImages,
} from '@/lib/images/image-selection-service';
import { isPlaceImagesEnabled } from '@/lib/images/places';

const STANDARD_CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const FAST_MODE_CACHE_TTL_MS = 1000 * 30; // 30 seconds
const CACHE_TTL_MS = isImageFastModeEnabled()
  ? FAST_MODE_CACHE_TTL_MS
  : STANDARD_CACHE_TTL_MS;
const MAX_CACHE_ENTRIES = 500;
const placesImageIpLimiter = rateLimit({
  prefix: 'places-image-ip',
  interval: 60_000,
  limit: 120,
});
const placesImageUserLimiter = rateLimit({
  prefix: 'places-image-user',
  interval: 60_000,
  limit: 90,
});

type CacheEntry = {
  url: string;
  expiresAt: number;
};

const responseCache = new Map<string, CacheEntry>();

function getCacheKey(
  query: string,
  width: number,
  height: number,
  sig: number,
  placeId?: string | null,
  country?: string | null
) {
  return `${query}|${width}x${height}|${sig}|${placeId ?? ''}|${country ?? ''}`;
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
  if (!isPlaceImagesEnabled()) {
    return NextResponse.redirect(fallbackImageUrl(request));
  }

  const authorization = await authorizeImageRequest(request);
  if (!authorization.authorized) {
    return NextResponse.redirect(fallbackImageUrl(request));
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const [ipLimit, userLimit] = await Promise.all([
    placesImageIpLimiter.check(ip),
    authorization.userId
      ? placesImageUserLimiter.check(authorization.userId)
      : Promise.resolve({ success: true, remaining: 0, resetAt: Date.now() }),
  ]);

  if (!ipLimit.success || !userLimit.success) {
    return NextResponse.redirect(fallbackImageUrl(request));
  }

  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get('query') || searchParams.get('q');
  const name = searchParams.get('name');
  const placeId = searchParams.get('placeId');
  const description = searchParams.get('description');
  const city = searchParams.get('city');
  const country = searchParams.get('country');
  const category = searchParams.get('category');
  const sig = Number(searchParams.get('sig') ?? 0);
  const { width, height } = parseDimensions(searchParams);

  const textQuery = buildTextQuery({ rawQuery, name, description, city, category });
  if (!textQuery) {
    return NextResponse.redirect(fallbackImageUrl(request));
  }

  const cacheKey = getCacheKey(textQuery, width, height, sig, placeId, country);
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.redirect(cached.url);
  }

  try {
    const images = await resolveVerifiedPlaceImages({
      textQuery,
      placeId: placeId ?? undefined,
      name: name ?? undefined,
      description: description ?? undefined,
      city: city ?? undefined,
      country: country ?? undefined,
      category: category ?? undefined,
      width,
      height,
      count: 1,
      sig,
      languageCode: process.env.GOOGLE_PLACES_LANGUAGE || undefined,
      regionCode: process.env.GOOGLE_PLACES_REGION || undefined,
    });

    const url = images[0]?.url;
    if (!url) {
      return NextResponse.redirect(fallbackImageUrl(request));
    }

    responseCache.set(cacheKey, {
      url,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    pruneCache();

    return NextResponse.redirect(url);
  } catch (error) {
    console.error('[places] image lookup failed', error);
    return NextResponse.redirect(fallbackImageUrl(request));
  }
}
