/**
 * Amadeus Hotel Search API client
 *
 * Wraps two Amadeus endpoints:
 *   - /v1/reference-data/locations/hotels/by-city  (hotel list by IATA city code)
 *   - /v3/shopping/hotel-offers                     (rates for specific hotels)
 *
 * Auth: OAuth2 client credentials, token cached in memory with TTL.
 * Follows the same pattern as google-places-client.ts — all calls go through callExternalApi().
 */

import { callExternalApi, type ExternalApiCallContext } from './external-api-gateway';
import type { HotelResult } from '@/types/hotels';
import { buildBookingComSearchLink } from '@/lib/hotels/affiliate-links';

const AMADEUS_AUTH_URL = 'https://test.api.amadeus.com/v1/security/oauth2/token';
const AMADEUS_HOTELS_BY_CITY_URL = 'https://test.api.amadeus.com/v1/reference-data/locations/hotels/by-city';
const AMADEUS_HOTEL_OFFERS_URL = 'https://test.api.amadeus.com/v3/shopping/hotel-offers';

// Estimated API cost per call (in micros). Amadeus free tier is generous but finite.
const HOTEL_SEARCH_COST_MICROS = 5_000;
const HOTEL_OFFERS_COST_MICROS = 10_000;

// --- Token cache ---

type TokenCache = {
  token: string;
  expiresAt: number; // Unix ms
};

let tokenCache: TokenCache | null = null;

export function resolveAmadeusCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.AMADEUS_API_KEY?.trim();
  const clientSecret = process.env.AMADEUS_API_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function fetchAmadeusToken(clientId: string, clientSecret: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(AMADEUS_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amadeus auth failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 30) * 1000, // 30s buffer
  };
  return tokenCache.token;
}

async function getToken(): Promise<string | null> {
  const creds = resolveAmadeusCredentials();
  if (!creds) return null;

  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  return fetchAmadeusToken(creds.clientId, creds.clientSecret);
}

// --- IATA city code lookup (simple map for common cities) ---

const CITY_TO_IATA: Record<string, string> = {
  amsterdam: 'AMS',
  athens: 'ATH',
  bangkok: 'BKK',
  barcelona: 'BCN',
  berlin: 'BER',
  brussels: 'BRU',
  budapest: 'BUD',
  cairo: 'CAI',
  cancun: 'CUN',
  dubai: 'DXB',
  dublin: 'DUB',
  florence: 'FLR',
  hong_kong: 'HKG',
  istanbul: 'IST',
  jakarta: 'JKT',
  kyoto: 'UKY',
  lisbon: 'LIS',
  london: 'LON',
  madrid: 'MAD',
  miami: 'MIA',
  milan: 'MIL',
  montreal: 'YMQ',
  moscow: 'MOW',
  munich: 'MUC',
  new_york: 'NYC',
  osaka: 'OSA',
  paris: 'PAR',
  prague: 'PRG',
  rio_de_janeiro: 'RIO',
  rome: 'ROM',
  san_francisco: 'SFO',
  seoul: 'SEL',
  singapore: 'SIN',
  sydney: 'SYD',
  taipei: 'TPE',
  tokyo: 'TYO',
  toronto: 'YTO',
  venice: 'VCE',
  vienna: 'VIE',
  warsaw: 'WAW',
  zurich: 'ZRH',
};

export function cityToIataCode(city: string): string | null {
  const normalized = city.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '');
  return CITY_TO_IATA[normalized] ?? null;
}

// --- Amadeus response types ---

type AmadeusHotel = {
  hotelId: string;
  name: string;
  iataCode?: string;
  address?: { cityName?: string; countryCode?: string; lines?: string[] };
  geoCode?: { latitude: number; longitude: number };
  rating?: string; // e.g. "4"
  amenities?: string[];
  media?: Array<{ uri: string; category?: string }>;
};

type AmadeusOffer = {
  hotel?: { hotelId: string; name?: string };
  offers?: Array<{
    price?: { total?: string; currency?: string };
    room?: { type?: string };
  }>;
};

// --- Hotel search functions ---

export type HotelSearchByCity = {
  cityCode: string;
  city: string;
  country: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  limit: number;
  context?: ExternalApiCallContext;
};

async function fetchHotelsByCity(
  token: string,
  cityCode: string,
  limit: number,
  context?: ExternalApiCallContext
): Promise<AmadeusHotel[]> {
  const url = new URL(AMADEUS_HOTELS_BY_CITY_URL);
  url.searchParams.set('cityCode', cityCode);
  url.searchParams.set('ratings', '3,4,5');
  url.searchParams.set('hotelSource', 'ALL');

  const res = await callExternalApi({
    provider: 'AMADEUS_HOTELS',
    endpoint: 'hotels.byCity',
    url: url.toString(),
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    estimatedCostMicros: HOTEL_SEARCH_COST_MICROS,
    context,
  });

  if (!res.ok) return [];

  const json = (await res.json()) as { data?: AmadeusHotel[] };
  return (json.data ?? []).slice(0, limit * 3); // fetch more, filter after
}

async function fetchHotelOffers(
  token: string,
  hotelIds: string[],
  checkIn: string,
  checkOut: string,
  adults: number,
  context?: ExternalApiCallContext
): Promise<Map<string, number>> {
  // Returns map of hotelId → price in cents
  const priceMap = new Map<string, number>();

  if (hotelIds.length === 0) return priceMap;

  const url = new URL(AMADEUS_HOTEL_OFFERS_URL);
  url.searchParams.set('hotelIds', hotelIds.slice(0, 20).join(','));
  url.searchParams.set('checkInDate', checkIn);
  url.searchParams.set('checkOutDate', checkOut);
  url.searchParams.set('adults', String(adults));
  url.searchParams.set('currency', 'USD');

  const res = await callExternalApi({
    provider: 'AMADEUS_HOTELS',
    endpoint: 'hotels.offers',
    url: url.toString(),
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    estimatedCostMicros: HOTEL_OFFERS_COST_MICROS,
    context,
  });

  if (!res.ok) return priceMap;

  const json = (await res.json()) as { data?: AmadeusOffer[] };
  for (const offer of json.data ?? []) {
    const hotelId = offer.hotel?.hotelId;
    const price = offer.offers?.[0]?.price?.total;
    if (hotelId && price) {
      priceMap.set(hotelId, Math.round(parseFloat(price) * 100));
    }
  }
  return priceMap;
}

function buildStarRating(rating?: string): number | undefined {
  if (!rating) return undefined;
  const n = parseInt(rating, 10);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : undefined;
}

function buildThumbnailUrl(hotel: AmadeusHotel): string | undefined {
  const photo = hotel.media?.find((m) => m.category === 'EXTERIOR' || m.uri);
  return photo?.uri;
}

/**
 * Search for hotels in a city and return enriched results with affiliate URLs.
 * Returns an empty array if Amadeus credentials are not configured.
 */
export async function searchHotels(params: HotelSearchByCity): Promise<HotelResult[]> {
  const token = await getToken();
  if (!token) {
    console.warn('[amadeus-hotels] No API credentials configured — returning empty results');
    return [];
  }

  const hotels = await fetchHotelsByCity(token, params.cityCode, params.limit, params.context);
  if (hotels.length === 0) return [];

  const hotelIds = hotels.map((h) => h.hotelId);
  const priceMap = await fetchHotelOffers(
    token,
    hotelIds,
    params.checkIn,
    params.checkOut,
    params.guests,
    params.context
  );

  // Build country code for affiliate links (Amadeus returns countryCode as ISO2)
  const countryCode = hotels[0]?.address?.countryCode ?? '';

  const results: HotelResult[] = hotels
    .filter((h) => h.geoCode?.latitude && h.geoCode?.longitude)
    .slice(0, params.limit)
    .map((hotel): HotelResult => {
      const pricePerNightCents = priceMap.get(hotel.hotelId);
      const stars = buildStarRating(hotel.rating);
      const nights = nightsBetween(params.checkIn, params.checkOut);
      const nightlyPrice =
        pricePerNightCents && nights > 0 ? Math.round(pricePerNightCents / nights) : undefined;

      const affiliateUrl = buildBookingComSearchLink({
        city: params.city,
        countryCode: countryCode || params.country.slice(0, 2).toUpperCase(),
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        adults: params.guests,
      });

      return {
        hotelId: hotel.hotelId,
        name: hotel.name,
        stars,
        lat: hotel.geoCode!.latitude,
        lng: hotel.geoCode!.longitude,
        address: hotel.address?.lines?.join(', '),
        city: hotel.address?.cityName ?? params.city,
        country: countryCode || params.country,
        pricePerNightCents: nightlyPrice,
        currency: 'USD',
        thumbnailUrl: buildThumbnailUrl(hotel),
        amenities: hotel.amenities ?? [],
        affiliateUrl,
      };
    });

  return results;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const msPerDay = 86_400_000;
  return Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / msPerDay));
}
