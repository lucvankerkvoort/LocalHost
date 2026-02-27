import { NextResponse } from 'next/server';

import {
  buildTextQuery,
  fallbackImageUrl,
  getStoredActivityPhotoUrls,
  parseCount,
  parseDimensions,
  persistActivityPhotoUrls,
  resolvePlaceImages,
  type PlaceImageEntry,
} from '../utils';

const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const MAX_CACHE_ENTRIES = 500;

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
  placeId?: string | null
) {
  return `${query}|${width}x${height}|${sig}|${count}|${placeId ?? '-'}`;
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
  const rawQuery = searchParams.get('query') || searchParams.get('q');
  const name = searchParams.get('name');
  const city = searchParams.get('city');
  const category = searchParams.get('category');
  const placeId = searchParams.get('placeId');
  const sig = Number(searchParams.get('sig') ?? 0);
  const { width, height } = parseDimensions(searchParams);
  const count = parseCount(searchParams);

  const storedPhotos = await getStoredActivityPhotoUrls(placeId);
  if (storedPhotos.length > 0) {
    const rotated =
      sig > 0 ? [...storedPhotos.slice(sig % storedPhotos.length), ...storedPhotos.slice(0, sig % storedPhotos.length)] : storedPhotos;
    const images = rotated.slice(0, count).map((url) => ({ url }));
    return NextResponse.json({ images });
  }

  const textQuery = buildTextQuery({ rawQuery, name, city, category });
  if (!textQuery) {
    return NextResponse.json({ images: [{ url: fallbackImageUrl(request) }] });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ images: [{ url: fallbackImageUrl(request) }] });
  }

  const cacheKey = getCacheKey(textQuery, width, height, sig, count, placeId);
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ images: cached.images });
  }

  try {
    const images = await resolvePlaceImages({
      textQuery,
      apiKey,
      width,
      height,
      count,
      sig,
      languageCode: process.env.GOOGLE_PLACES_LANGUAGE || undefined,
      regionCode: process.env.GOOGLE_PLACES_REGION || undefined,
    });

    const finalImages =
      images.length > 0 ? images : [{ url: fallbackImageUrl(request) }];

    if (placeId && images.length > 0) {
      void persistActivityPhotoUrls(placeId, images.map((image) => image.url));
    }

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
