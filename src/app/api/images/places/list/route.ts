import { NextResponse } from 'next/server';

import {
  buildTextQuery,
  fallbackImageUrl,
  parseCount,
  parseDimensions,
} from '../utils';
import { rateLimit } from '@/lib/api/rate-limit';
import { authorizeImageRequest } from '@/lib/images/request-auth';
import {
  resolveVerifiedPlaceImages,
  type PlaceImageEntry,
} from '@/lib/images/image-selection-service';

const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const MAX_CACHE_ENTRIES = 500;
const placesImageListIpLimiter = rateLimit({
  prefix: 'places-image-list-ip',
  interval: 60_000,
  limit: 120,
});
const placesImageListUserLimiter = rateLimit({
  prefix: 'places-image-list-user',
  interval: 60_000,
  limit: 90,
});

type CacheEntry = {
  images: PlaceImageEntry[];
  expiresAt: number;
};

const responseCache = new Map<string, CacheEntry>();

function getCacheKey(
  query: string,
  width: number,
  height: number,
  sig: number,
  count: number,
  country?: string | null
) {
  return `${query}|${width}x${height}|${sig}|${count}|${country ?? ''}`;
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
  const authorization = await authorizeImageRequest(request);
  if (!authorization.authorized) {
    console.warn('[places] Image request rejected:', authorization.reason);
    return NextResponse.json({ images: [{ url: fallbackImageUrl(request) }] });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const [ipLimit, userLimit] = await Promise.all([
    placesImageListIpLimiter.check(ip),
    authorization.userId
      ? placesImageListUserLimiter.check(authorization.userId)
      : Promise.resolve({ success: true, remaining: 0, resetAt: Date.now() }),
  ]);

  if (!ipLimit.success || !userLimit.success) {
    return NextResponse.json({ images: [{ url: fallbackImageUrl(request) }] });
  }

  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get('query') || searchParams.get('q');
  const name = searchParams.get('name');
  const description = searchParams.get('description');
  const city = searchParams.get('city');
  const country = searchParams.get('country');
  const category = searchParams.get('category');
  const sig = Number(searchParams.get('sig') ?? 0);
  const { width, height } = parseDimensions(searchParams);
  const count = parseCount(searchParams);

  const textQuery = buildTextQuery({ rawQuery, name, description, city, category });
  if (!textQuery) {
    return NextResponse.json({ images: [{ url: fallbackImageUrl(request) }] });
  }

  const cacheKey = getCacheKey(textQuery, width, height, sig, count, country);
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ images: cached.images });
  }

  try {
    const images = await resolveVerifiedPlaceImages({
      textQuery,
      name: name ?? undefined,
      description: description ?? undefined,
      city: city ?? undefined,
      country: country ?? undefined,
      category: category ?? undefined,
      width,
      height,
      count,
      sig,
      languageCode: process.env.GOOGLE_PLACES_LANGUAGE || undefined,
      regionCode: process.env.GOOGLE_PLACES_REGION || undefined,
    });

    const finalImages =
      images.length > 0 ? images : [{ url: fallbackImageUrl(request) }];

    responseCache.set(cacheKey, {
      images: finalImages,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    pruneCache();

    return NextResponse.json({ images: finalImages });
  } catch (error) {
    console.error('[places] image list lookup failed', error);
    return NextResponse.json({ images: [{ url: fallbackImageUrl(request) }] });
  }
}
