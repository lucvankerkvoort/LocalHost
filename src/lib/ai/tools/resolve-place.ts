import { z } from 'zod';

import { isObviouslyInvalid, validateCoordinate } from '../validation/geo-validator';
import { createTool, ToolResult } from './tool-registry';

const ResolvePlaceParams = z.object({
  name: z.string().describe('Name of the place to geocode'),
  context: z.string().optional().describe('City, country, or area hint for disambiguation'),
  anchorPoint: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional()
    .describe('Reference point (e.g. city center) to prefer closer results'),
});

type ResolvePlaceResult = {
  id: string;
  name: string;
  formattedAddress: string;
  location: {
    lat: number;
    lng: number;
  };
  category: 'landmark' | 'museum' | 'restaurant' | 'park' | 'neighborhood' | 'city' | 'country' | 'other';
  confidence: number;
  distanceToAnchor?: number;
  city?: string;
  geoValidation?: 'HIGH' | 'MEDIUM' | 'LOW' | 'FAILED';
};

type GooglePlacesTextSearchResponse = {
  places?: GooglePlaceResult[];
};

type GooglePlaceResult = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
};

const GEOCODE_CACHE = new Map<string, ResolvePlaceResult[]>();
const GOOGLE_PLACES_TIMEOUT_MS = 8000;
const SKIP_DB_LOOKUPS = process.env.NODE_ENV === 'test';

type PrismaClientRef = typeof import('@/lib/prisma').prisma;
let prismaClientPromise: Promise<PrismaClientRef> | null = null;

async function getPrismaClient(): Promise<PrismaClientRef> {
  if (!prismaClientPromise) {
    prismaClientPromise = import('@/lib/prisma').then((module) => module.prisma);
  }
  return prismaClientPromise;
}

// ---------------------------------------------------------------------------
// PlaceCache — DB-backed geocoding cache
// ---------------------------------------------------------------------------

function normalizeCacheKey(name: string, context?: string): { name: string; context: string } {
  return {
    name: name.trim().toLowerCase(),
    context: (context ?? '').trim().toLowerCase(),
  };
}

function extractGooglePlaceId(resultId: string): string | null {
  if (!resultId.startsWith('gplaces-')) return null;
  const value = resultId.slice('gplaces-'.length).trim();
  return value.length > 0 ? value : null;
}

function mapResolveCategoryToActivityCategory(
  category: ResolvePlaceResult['category']
): string {
  switch (category) {
    case 'landmark':
      return 'Landmark';
    case 'museum':
      return 'Museum';
    case 'restaurant':
      return 'Restaurant';
    case 'park':
      return 'Park';
    case 'city':
      return 'City';
    default:
      return 'Other';
  }
}

function mapActivityCategoryToResolveCategory(
  category: string | null | undefined
): ResolvePlaceResult['category'] {
  const normalized = (category ?? '').trim().toLowerCase();
  if (normalized.includes('museum')) return 'museum';
  if (normalized.includes('restaurant') || normalized.includes('food')) return 'restaurant';
  if (normalized.includes('park')) return 'park';
  if (normalized.includes('city')) return 'city';
  if (normalized.includes('country')) return 'country';
  if (normalized.includes('neighborhood')) return 'neighborhood';
  if (normalized.includes('landmark')) return 'landmark';
  return 'other';
}

function parseContextLocation(context?: string): { city?: string; country?: string } {
  if (!context) return {};
  const parts = context
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) {
    return { city: parts[0] };
  }
  return {
    city: parts[0],
    country: parts[parts.length - 1],
  };
}

function inferCountryFromAddress(formattedAddress?: string): string | undefined {
  if (!formattedAddress) return undefined;
  const parts = formattedAddress
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  const country = parts[parts.length - 1];
  return country.length > 1 ? country : undefined;
}

function canPersistAsActivity(result: ResolvePlaceResult): boolean {
  return result.category !== 'city' && result.category !== 'country';
}

async function checkPlaceCache(
  name: string,
  context?: string
): Promise<ResolvePlaceResult | null> {
  if (SKIP_DB_LOOKUPS) return null;
  try {
    const prisma = await getPrismaClient();
    const key = normalizeCacheKey(name, context);
    const row = await prisma.placeCache.findUnique({
      where: { name_context: key },
    });
    if (!row) return null;
    console.log(`[PlaceCache] HIT: "${name}" in "${context ?? ''}"`);
    return {
      id: row.placeId ? `gplaces-${row.placeId}` : `cached-${row.id}`,
      name: row.name,
      formattedAddress: row.formattedAddress ?? row.name,
      location: { lat: row.lat, lng: row.lng },
      category: (row.category as ResolvePlaceResult['category']) ?? 'other',
      confidence: row.confidence ?? 0.9,
      city: row.city ?? undefined,
    };
  } catch {
    // Cache miss or DB error — fall through to API
    return null;
  }
}

async function writePlaceCache(
  name: string,
  context: string | undefined,
  result: ResolvePlaceResult
): Promise<void> {
  if (SKIP_DB_LOOKUPS) return;
  try {
    const prisma = await getPrismaClient();
    const key = normalizeCacheKey(name, context);
    const googlePlaceId = extractGooglePlaceId(result.id);
    await prisma.placeCache.upsert({
      where: { name_context: key },
      create: {
        ...key,
        placeId: googlePlaceId,
        formattedAddress: result.formattedAddress,
        lat: result.location.lat,
        lng: result.location.lng,
        category: result.category,
        city: result.city ?? null,
        confidence: result.confidence,
      },
      update: {
        placeId: googlePlaceId,
        formattedAddress: result.formattedAddress,
        lat: result.location.lat,
        lng: result.location.lng,
        category: result.category,
        city: result.city ?? null,
        confidence: result.confidence,
      },
    });
  } catch (error) {
    // Non-fatal — just log and continue
    console.warn('[PlaceCache] Failed to write cache entry:', error);
  }
}

export function resolveGoogleApiKey(): string | null {
  const key =
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function buildQueryVariants(name: string, context?: string): string[] {
  const variants: string[] = [];
  const trimmedName = name.trim();
  if (!trimmedName) return [];

  if (context) {
    const parts = context.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) {
      const firstPart = parts[0];
      if (trimmedName.toLowerCase() !== firstPart.toLowerCase()) {
        variants.push(`${trimmedName}, ${firstPart}`);
      }
    }
    // Only prepend the name if it's not already the leading term in the context
    if (context.toLowerCase().startsWith(trimmedName.toLowerCase() + ',')) {
      variants.push(context.trim());
    } else {
      variants.push(`${trimmedName}, ${context.trim()}`);
    }
  }

  variants.push(trimmedName);
  return Array.from(new Set(variants));
}

function normalizeCityKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function extractContextCity(context?: string): string | null {
  if (!context) return null;
  const parts = context.split(',').map((part) => part.trim()).filter(Boolean);
  return parts[0] || null;
}

function isCityMatch(expectedCity: string, candidate?: string): boolean {
  if (!candidate) return false;
  const expectedKey = normalizeCityKey(expectedCity);
  const candidateKey = normalizeCityKey(candidate);
  if (!expectedKey || !candidateKey) return false;
  if (expectedKey === candidateKey) return true;
  if (expectedKey.length >= 4 && candidateKey.includes(expectedKey)) return true;
  if (candidateKey.length >= 4 && expectedKey.includes(candidateKey)) return true;
  return expectedKey.slice(0, 3) === candidateKey.slice(0, 3);
}

function filterResultsByCity(
  results: ResolvePlaceResult[],
  expectedCity: string | null
): ResolvePlaceResult[] {
  if (!expectedCity) return results;
  const expectedKey = normalizeCityKey(expectedCity);
  if (!expectedKey) return results;

  const matches = results.filter((result) => {
    if (isCityMatch(expectedCity, result.city)) return true;
    if (result.formattedAddress) {
      const addressKey = normalizeCityKey(result.formattedAddress);
      if (addressKey.includes(expectedKey)) return true;
    }
    return false;
  });

  return matches.length > 0 ? matches : results;
}

function mapGoogleCategory(types?: string[]): ResolvePlaceResult['category'] {
  if (!types || types.length === 0) return 'other';
  const set = new Set(types);
  if (set.has('museum') || set.has('art_gallery')) return 'museum';
  if (set.has('tourist_attraction') || set.has('point_of_interest') || set.has('landmark')) {
    return 'landmark';
  }
  if (set.has('park') || set.has('campground') || set.has('national_park')) return 'park';
  if (set.has('restaurant') || set.has('cafe') || set.has('bar') || set.has('food')) {
    return 'restaurant';
  }
  if (set.has('neighborhood') || set.has('sublocality') || set.has('sublocality_level_1')) {
    return 'neighborhood';
  }
  if (set.has('locality') || set.has('administrative_area_level_2')) return 'city';
  if (set.has('country')) return 'country';
  return 'other';
}

function extractGoogleCity(components?: GooglePlaceResult['addressComponents']): string | undefined {
  if (!components) return undefined;

  const pick = (type: string) =>
    components.find((component) => component.types?.includes(type))?.longText ||
    components.find((component) => component.types?.includes(type))?.shortText;

  return (
    pick('locality') ||
    pick('postal_town') ||
    pick('administrative_area_level_2') ||
    pick('administrative_area_level_1') ||
    undefined
  );
}

function formatGoogleResult(result: GooglePlaceResult, fallbackName: string): ResolvePlaceResult | null {
  if (
    !result.location ||
    typeof result.location.latitude !== 'number' ||
    typeof result.location.longitude !== 'number'
  ) {
    return null;
  }

  const name = result.displayName?.text || fallbackName;
  return {
    id: result.id ? `gplaces-${result.id}` : `gplaces-${name}`,
    name,
    formattedAddress: result.formattedAddress || name,
    location: {
      lat: result.location.latitude,
      lng: result.location.longitude,
    },
    category: mapGoogleCategory(result.types),
    confidence: 0.9,
    city: extractGoogleCity(result.addressComponents),
  };
}

function attachDistanceToAnchor(
  result: ResolvePlaceResult,
  anchorPoint?: { lat: number; lng: number }
): ResolvePlaceResult {
  if (!anchorPoint) return result;
  return {
    ...result,
    distanceToAnchor: calculateDistance(
      result.location.lat,
      result.location.lng,
      anchorPoint.lat,
      anchorPoint.lng
    ),
  };
}

function pickBestCandidate(
  candidates: ResolvePlaceResult[],
  anchorPoint?: { lat: number; lng: number }
): ResolvePlaceResult | null {
  if (candidates.length === 0) return null;

  const scored = candidates.map((candidate) => {
    const validation = validateCoordinate(candidate.location.lat, candidate.location.lng);
    const distance = anchorPoint
      ? calculateDistance(
          candidate.location.lat,
          candidate.location.lng,
          anchorPoint.lat,
          anchorPoint.lng
        )
      : null;
    return { candidate, validation, distance };
  });

  const valid = scored.filter(
    (item) =>
      item.validation.valid &&
      !isObviouslyInvalid(item.candidate.location.lat, item.candidate.location.lng)
  );
  const bucket = valid.length > 0 ? valid : scored;

  bucket.sort((a, b) => {
    const confidenceOrder = { HIGH: 0, MEDIUM: 1, LOW: 2, FAILED: 3 } as const;
    const confidenceA = confidenceOrder[a.validation.confidence];
    const confidenceB = confidenceOrder[b.validation.confidence];
    if (confidenceA !== confidenceB) return confidenceA - confidenceB;
    if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
    return b.candidate.confidence - a.candidate.confidence;
  });

  const best = bucket[0];
  return {
    ...best.candidate,
    geoValidation: best.validation.confidence,
  };
}

async function checkActivityCatalog(
  name: string,
  context: string | undefined,
  anchorPoint?: { lat: number; lng: number }
): Promise<ResolvePlaceResult | null> {
  if (SKIP_DB_LOOKUPS) return null;
  const prisma = await getPrismaClient();
  const activityDelegate = (prisma as unknown as { activity?: { findMany?: unknown } }).activity;
  if (!activityDelegate || typeof activityDelegate.findMany !== 'function') {
    return null;
  }

  const trimmedName = name.trim();
  if (!trimmedName) return null;
  const parsed = parseContextLocation(context);

  try {
    const rows = await prisma.activity.findMany({
      where: {
        name: { equals: trimmedName, mode: 'insensitive' },
        city: {
          ...(parsed.city ? { name: { equals: parsed.city, mode: 'insensitive' } } : {}),
          ...(parsed.country ? { country: { equals: parsed.country, mode: 'insensitive' } } : {}),
        },
      },
      select: {
        id: true,
        name: true,
        category: true,
        lat: true,
        lng: true,
        formattedAddress: true,
        cityId: true,
      },
      take: 12,
    });

    if (rows.length === 0) return null;

    const cityIds = Array.from(new Set(rows.map((row) => row.cityId)));
    const cityRows = await prisma.city.findMany({
      where: {
        id: {
          in: cityIds,
        },
      },
      select: {
        id: true,
        name: true,
        country: true,
      },
    });
    const cityMap = new Map(cityRows.map((city) => [city.id, city]));

    const candidates: ResolvePlaceResult[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      formattedAddress:
        row.formattedAddress ??
        `${row.name}, ${cityMap.get(row.cityId)?.name ?? ''}, ${cityMap.get(row.cityId)?.country ?? ''}`.trim(),
      location: { lat: row.lat, lng: row.lng },
      category: mapActivityCategoryToResolveCategory(row.category),
      confidence: 0.98,
      city: cityMap.get(row.cityId)?.name,
      geoValidation: 'HIGH',
    }));

    const expectedCity = extractContextCity(context);
    const filtered = filterResultsByCity(candidates, expectedCity);
    const best = pickBestCandidate(filtered, anchorPoint);
    if (!best) return null;
    return attachDistanceToAnchor(best, anchorPoint);
  } catch (error) {
    console.warn('[resolve_place] Activity catalog lookup failed', error);
    return null;
  }
}

async function resolveOrCreateActivity(
  result: ResolvePlaceResult,
  context?: string
): Promise<ResolvePlaceResult> {
  if (SKIP_DB_LOOKUPS) return result;
  if (!canPersistAsActivity(result)) return result;

  const prisma = await getPrismaClient();
  const activityDelegate = (prisma as unknown as { activity?: { findUnique?: unknown; findFirst?: unknown; create?: unknown; update?: unknown } }).activity;
  const cityDelegate = (prisma as unknown as { city?: { findFirst?: unknown; create?: unknown; update?: unknown } }).city;
  if (
    !activityDelegate ||
    !cityDelegate ||
    typeof activityDelegate.findUnique !== 'function' ||
    typeof activityDelegate.findFirst !== 'function' ||
    typeof activityDelegate.create !== 'function' ||
    typeof activityDelegate.update !== 'function' ||
    typeof cityDelegate.findFirst !== 'function' ||
    typeof cityDelegate.create !== 'function' ||
    typeof cityDelegate.update !== 'function'
  ) {
    return result;
  }

  const googlePlaceId = extractGooglePlaceId(result.id);

  try {
    if (googlePlaceId) {
      const existingByExternalId = await prisma.activity.findUnique({
        where: { externalId: googlePlaceId },
        select: { id: true },
      });
      if (existingByExternalId) {
        return {
          ...result,
          id: existingByExternalId.id,
        };
      }
    }

    const parsed = parseContextLocation(context);
    const cityName = (result.city || parsed.city || '').trim();
    const country = (parsed.country || inferCountryFromAddress(result.formattedAddress) || '').trim();
    if (!cityName || !country) return result;

    let city = await prisma.city.findFirst({
      where: {
        name: { equals: cityName, mode: 'insensitive' },
        country: { equals: country, mode: 'insensitive' },
      },
    });

    if (!city) {
      city = await prisma.city.create({
        data: {
          name: cityName,
          country,
          tier: 3,
          activityCount: 0,
        },
      });
    }

    if (!city) return result;

    const existingByName = await prisma.activity.findFirst({
      where: {
        cityId: city.id,
        name: { equals: result.name, mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (existingByName) {
      await prisma.activity.update({
        where: { id: existingByName.id },
        data: {
          lat: result.location.lat,
          lng: result.location.lng,
          formattedAddress: result.formattedAddress,
          category: mapResolveCategoryToActivityCategory(result.category),
          ...(googlePlaceId ? { externalId: googlePlaceId } : {}),
          lastVerifiedAt: new Date(),
        },
      });
      return {
        ...result,
        id: existingByName.id,
        city: city.name,
      };
    }

    const created = await prisma.activity.create({
      data: {
        cityId: city.id,
        source: 'google',
        externalId: googlePlaceId,
        name: result.name,
        category: mapResolveCategoryToActivityCategory(result.category),
        lat: result.location.lat,
        lng: result.location.lng,
        formattedAddress: result.formattedAddress,
        metadataJson: {
          resolver: 'resolve_place',
          context: context ?? null,
        },
      },
      select: { id: true },
    });

    await prisma.city.update({
      where: { id: city.id },
      data: {
        activityCount: { increment: 1 },
      },
    });

    return {
      ...result,
      id: created.id,
      city: city.name,
    };
  } catch (error) {
    console.warn('[resolve_place] Failed to resolve-or-create activity', error);
    return result;
  }
}

export async function fetchGooglePlacesResults(
  query: string,
  apiKey: string,
  anchorPoint?: { lat: number; lng: number }
): Promise<ResolvePlaceResult[]> {
  const languageCode = process.env.GOOGLE_PLACES_LANGUAGE;
  const regionCode = process.env.GOOGLE_PLACES_REGION;

  const body: Record<string, unknown> = {
    textQuery: query,
    pageSize: 5,
  };

  if (languageCode) body.languageCode = languageCode;
  if (regionCode) body.regionCode = regionCode;
  if (anchorPoint) {
    body.locationBias = {
      circle: {
        center: { latitude: anchorPoint.lat, longitude: anchorPoint.lng },
        radius: 50000,
      },
    };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, GOOGLE_PLACES_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.addressComponents',
      },
      cache: 'no-store',
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn(
        `[resolve_place] Google Places request timed out after ${GOOGLE_PLACES_TIMEOUT_MS}ms for query: ${query}`
      );
      return [];
    }
    console.warn('[resolve_place] Google Places request failed', error);
    return [];
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    console.warn('[resolve_place] Google Places searchText failed', response.status, response.statusText);
    return [];
  }

  const payload = (await response.json()) as GooglePlacesTextSearchResponse;
  return (payload.places ?? [])
    .map((place) => formatGoogleResult(place, query))
    .filter((place): place is ResolvePlaceResult => Boolean(place));
}

export const __resolvePlaceInternals = {
  extractGooglePlaceId,
  parseContextLocation,
  canPersistAsActivity,
};

export const resolvePlaceTool = createTool({
  name: 'resolve_place',
  description:
    'Resolve a place with DB-first lookup. Check Activity catalog first; if missing, geocode via Google Places and upsert canonical City/Activity records.',
  parameters: ResolvePlaceParams,

  async handler(params): Promise<ToolResult<ResolvePlaceResult>> {
    try {
      const queryVariants = buildQueryVariants(params.name, params.context);
      const expectedCity = extractContextCity(params.context);
      const cacheKey = `${params.name}|${params.context || ''}`;

      // 1. Check canonical Activity/City catalog first.
      const catalogResult = await checkActivityCatalog(
        params.name,
        params.context,
        params.anchorPoint
      );
      if (catalogResult) {
        return { success: true, data: attachDistanceToAnchor(catalogResult, params.anchorPoint) };
      }

      // 2. Check DB-backed PlaceCache.
      const dbCached = await checkPlaceCache(params.name, params.context);
      if (dbCached) {
        const canonical = await resolveOrCreateActivity(dbCached, params.context);
        return { success: true, data: attachDistanceToAnchor(canonical, params.anchorPoint) };
      }

      // 3. Check in-memory cache (survives within same request/process).
      if (GEOCODE_CACHE.has(cacheKey)) {
        const cachedResults = GEOCODE_CACHE.get(cacheKey) ?? [];
        if (cachedResults.length > 0) {
          const candidateResults = filterResultsByCity(cachedResults, expectedCity);
          const best = pickBestCandidate(candidateResults, params.anchorPoint);
          if (best) {
            const canonical = await resolveOrCreateActivity(best, params.context);
            return { success: true, data: attachDistanceToAnchor(canonical, params.anchorPoint) };
          }
        }
      }

      // 4. Fallback to Google Places API when cache/catalog miss.
      const apiKey = resolveGoogleApiKey();
      if (!apiKey) {
        return {
          success: false,
          error: 'GOOGLE_PLACES_API_KEY is not configured',
          code: 'CONFIG_ERROR',
        };
      }

      for (const query of queryVariants) {
        const results = await fetchGooglePlacesResults(query, apiKey, params.anchorPoint);
        if (results.length === 0) continue;

        GEOCODE_CACHE.set(cacheKey, results);
        const candidateResults = filterResultsByCity(results, expectedCity);
        const best = pickBestCandidate(candidateResults, params.anchorPoint);
        if (best) {
          // Write to DB cache for future requests/cold starts
          await writePlaceCache(params.name, params.context, best);
          const canonical = await resolveOrCreateActivity(best, params.context);
          return { success: true, data: attachDistanceToAnchor(canonical, params.anchorPoint) };
        }
      }

      return {
        success: false,
        error: `No location found for: ${params.name}`,
        code: 'NO_RESULTS',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Geocoding failed',
        code: 'GEOCODE_ERROR',
      };
    }
  },
});
