import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

import {
  buildTextQuery,
  fallbackImageUrl,
  parseCount,
  parseDimensions,
} from '../utils';
import { rateLimit } from '@/lib/api/rate-limit';
import { prisma } from '@/lib/prisma';
import { authorizeImageRequest } from '@/lib/images/request-auth';
import {
  isImageFastModeEnabled,
  resolveVerifiedPlaceImages,
  type PlaceImageEntry,
} from '@/lib/images/image-selection-service';
import { isPlaceImagesEnabled } from '@/lib/images/places';

const STANDARD_CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const FAST_MODE_CACHE_TTL_MS = 1000 * 30; // 30 seconds
const CACHE_TTL_MS = isImageFastModeEnabled()
  ? FAST_MODE_CACHE_TTL_MS
  : STANDARD_CACHE_TTL_MS;
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
const MAX_PERSISTED_ITEM_IMAGES = 3;

function getCacheKey(
  query: string,
  width: number,
  height: number,
  sig: number,
  count: number,
  placeId?: string | null,
  country?: string | null
) {
  return `${query}|${width}x${height}|${sig}|${count}|${placeId ?? ''}|${country ?? ''}`;
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

function isFallbackUrl(url: string): boolean {
  return url.includes('/globe.svg');
}

async function persistItineraryItemImages(options: {
  itemId: string;
  userId: string;
  images: PlaceImageEntry[];
}): Promise<void> {
  const normalized = options.images
    .filter((image) => typeof image.url === 'string' && image.url.length > 0)
    .filter((image) => !isFallbackUrl(image.url))
    .slice(0, MAX_PERSISTED_ITEM_IMAGES);

  if (normalized.length === 0) return;

  const ownedItem = await prisma.itineraryItem.findFirst({
    where: {
      id: options.itemId,
      day: {
        tripAnchor: {
          trip: {
            userId: options.userId,
          },
        },
      },
    },
    select: { id: true },
  });

  if (!ownedItem) return;

  await prisma.$transaction(async (tx) => {
    await tx.itineraryItemImage.deleteMany({
      where: { itineraryItemId: options.itemId },
    });

    await tx.itineraryItemImage.createMany({
      data: normalized.map((image, position) => ({
        itineraryItemId: options.itemId,
        position,
        assetId: image.assetId ?? null,
        url: image.url,
        attributionJson: image.attribution
          ? (image.attribution as Prisma.InputJsonValue)
          : undefined,
        provider: image.provider ?? null,
      })),
    });
  });
}

export async function GET(request: Request) {
  if (!isPlaceImagesEnabled()) {
    return NextResponse.json({ images: [{ url: fallbackImageUrl(request) }] });
  }

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
  const itemId = searchParams.get('itemId');
  const name = searchParams.get('name');
  const placeId = searchParams.get('placeId');
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

  const cacheKey = getCacheKey(textQuery, width, height, sig, count, placeId, country);
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (itemId && authorization.userId) {
      try {
        await persistItineraryItemImages({
          itemId,
          userId: authorization.userId,
          images: cached.images,
        });
      } catch (error) {
        console.warn('[places] failed to persist itinerary item images from cache', error);
      }
    }
    return NextResponse.json({ images: cached.images });
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
      count,
      sig,
      languageCode: process.env.GOOGLE_PLACES_LANGUAGE || undefined,
      regionCode: process.env.GOOGLE_PLACES_REGION || undefined,
    });

    const finalImages =
      images.length > 0 ? images : [{ url: fallbackImageUrl(request) }];

    if (itemId && authorization.userId) {
      try {
        await persistItineraryItemImages({
          itemId,
          userId: authorization.userId,
          images: finalImages,
        });
      } catch (error) {
        console.warn('[places] failed to persist itinerary item images', error);
      }
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
