import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { HotelSearchParamsSchema, type HotelSearchResponse } from '@/types/hotels';
import { searchHotels, cityToIataCode } from '@/lib/providers/amadeus-hotels-client';
import { buildBookingComSearchLink } from '@/lib/hotels/affiliate-links';
import type { HotelResult } from '@/types/hotels';

// In-memory cache keyed by city+checkIn+checkOut+guests, 1h TTL
type CacheEntry = { hotels: HotelResult[]; cachedAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function makeCacheKey(city: string, checkIn: string, checkOut: string, guests: number): string {
  return `${city.toLowerCase()}|${checkIn}|${checkOut}|${guests}`;
}

function getFromCache(key: string): HotelResult[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.hotels;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = HotelSearchParamsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid search parameters', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { city, country, checkIn, checkOut, guests, limit } = parsed.data;

  const cacheKey = makeCacheKey(city, checkIn, checkOut, guests);
  const cached = getFromCache(cacheKey);
  if (cached) {
    const response: HotelSearchResponse = { hotels: cached, city, checkIn, checkOut };
    return NextResponse.json(response);
  }

  try {
    const cityCode = cityToIataCode(city);

    let hotels: HotelResult[];

    if (cityCode) {
      hotels = await searchHotels({
        cityCode,
        city,
        country,
        checkIn,
        checkOut,
        guests,
        limit,
        context: { userId: session.user.id },
      });
    } else {
      // City not in IATA map — return a single affiliate search link as a fallback
      const affiliateUrl = buildBookingComSearchLink({
        city,
        countryCode: country.slice(0, 2).toUpperCase(),
        checkIn,
        checkOut,
        adults: guests,
      });
      hotels = [
        {
          hotelId: `fallback-${city.toLowerCase().replace(/\s+/g, '-')}`,
          name: `Hotels in ${city}`,
          lat: 0,
          lng: 0,
          city,
          country,
          currency: 'USD',
          amenities: [],
          affiliateUrl,
        },
      ];
    }

    cache.set(cacheKey, { hotels, cachedAt: Date.now() });

    const response: HotelSearchResponse = { hotels, city, checkIn, checkOut };
    return NextResponse.json(response);
  } catch (err) {
    console.error('[GET /api/hotels/search]', err);
    return NextResponse.json({ error: 'Hotel search failed' }, { status: 500 });
  }
}
