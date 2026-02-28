import { z } from 'zod';

import { prisma } from '@/lib/prisma';
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

// ---------------------------------------------------------------------------
// PlaceCache — DB-backed geocoding cache
// ---------------------------------------------------------------------------

function normalizeCacheKey(name: string, context?: string): { name: string; context: string } {
  return {
    name: name.trim().toLowerCase(),
    context: (context ?? '').trim().toLowerCase(),
  };
}

async function checkPlaceCache(
  name: string,
  context?: string
): Promise<ResolvePlaceResult | null> {
  try {
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
  try {
    const key = normalizeCacheKey(name, context);
    await prisma.placeCache.upsert({
      where: { name_context: key },
      create: {
        ...key,
        placeId: result.id.replace(/^gplaces-/, '') || null,
        formattedAddress: result.formattedAddress,
        lat: result.location.lat,
        lng: result.location.lng,
        category: result.category,
        city: result.city ?? null,
        confidence: result.confidence,
      },
      update: {
        placeId: result.id.replace(/^gplaces-/, '') || null,
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

export const resolvePlaceTool = createTool({
  name: 'resolve_place',
  description: 'Convert a place name to geographic coordinates using Google Places.',
  parameters: ResolvePlaceParams,

  async handler(params): Promise<ToolResult<ResolvePlaceResult>> {
    try {
      const apiKey = resolveGoogleApiKey();
      if (!apiKey) {
        return {
          success: false,
          error: 'GOOGLE_PLACES_API_KEY is not configured',
          code: 'CONFIG_ERROR',
        };
      }

      const queryVariants = buildQueryVariants(params.name, params.context);
      const expectedCity = extractContextCity(params.context);
      const cacheKey = `${params.name}|${params.context || ''}`;

      // 1. Check DB-backed PlaceCache first
      const dbCached = await checkPlaceCache(params.name, params.context);
      if (dbCached) {
        return { success: true, data: attachDistanceToAnchor(dbCached, params.anchorPoint) };
      }

      // 2. Check in-memory cache (survives within same request/process)
      if (GEOCODE_CACHE.has(cacheKey)) {
        const cachedResults = GEOCODE_CACHE.get(cacheKey) ?? [];
        if (cachedResults.length > 0) {
          const candidateResults = filterResultsByCity(cachedResults, expectedCity);
          const best = pickBestCandidate(candidateResults, params.anchorPoint);
          if (best) {
            return { success: true, data: attachDistanceToAnchor(best, params.anchorPoint) };
          }
        }
      }

      for (const query of queryVariants) {
        const results = await fetchGooglePlacesResults(query, apiKey, params.anchorPoint);
        if (results.length === 0) continue;

        GEOCODE_CACHE.set(cacheKey, results);
        const candidateResults = filterResultsByCity(results, expectedCity);
        const best = pickBestCandidate(candidateResults, params.anchorPoint);
        if (best) {
          // Write to DB cache for future requests/cold starts
          void writePlaceCache(params.name, params.context, best);
          return { success: true, data: attachDistanceToAnchor(best, params.anchorPoint) };
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
