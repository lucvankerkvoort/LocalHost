import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { OPENAI_DEFAULT_MODEL } from '@/lib/ai/model-config';
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
  canonicalPlaceId?: string;
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

const PlaceCategorySchema = z.enum([
  'landmark',
  'museum',
  'restaurant',
  'park',
  'neighborhood',
  'city',
  'country',
  'other',
]);

const LlmResolvedPlacesSchema = z.object({
  candidates: z
    .array(
      z.object({
        name: z.string().min(1),
        formattedAddress: z.string().min(1),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        category: PlaceCategorySchema,
        confidence: z.number().min(0).max(1),
        city: z.string().min(1).nullable(),
      })
    )
    .max(5),
});

type LlmResolvedPlaceCandidate = z.infer<typeof LlmResolvedPlacesSchema>['candidates'][number];

const GEOCODE_CACHE = new Map<string, ResolvePlaceResult[]>();
const IN_FLIGHT_LOOKUPS = new Map<string, Promise<ResolvePlaceResult[]>>();
const PLACE_TTL_MS = 1000 * 60 * 60 * 24 * 90;
const PLACE_QUERY_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

// ---------------------------------------------------------------------------
// PlaceCache — DB-backed geocoding cache
// ---------------------------------------------------------------------------

function normalizeCacheKey(name: string, context?: string): { name: string; context: string } {
  return {
    name: name.trim().toLowerCase(),
    context: (context ?? '').trim().toLowerCase(),
  };
}

function normalizePlaceText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, ' ');
}

function parseGooglePlaceId(resultId: string): string | null {
  if (!resultId.startsWith('gplaces-')) return null;
  const providerPlaceId = resultId.replace(/^gplaces-/, '').trim();
  return providerPlaceId || null;
}

function extractCountryFromContext(context?: string): string | null {
  if (!context) return null;
  const parts = context.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return parts[parts.length - 1] ?? null;
}

function buildPlaceFingerprint(input: {
  name: string;
  lat: number;
  lng: number;
  city?: string;
  country?: string;
}): string {
  const roundedLat = input.lat.toFixed(5);
  const roundedLng = input.lng.toFixed(5);
  return [
    normalizePlaceText(input.name),
    normalizePlaceText(input.city ?? ''),
    normalizePlaceText(input.country ?? ''),
    roundedLat,
    roundedLng,
  ].join('|');
}

function buildSyntheticPlaceId(name: string, context?: string): string {
  const seed = `${normalizePlaceText(name)}|${normalizePlaceText(context ?? '')}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `llm-${Math.abs(hash).toString(36)}`;
}

function toResolveResultFromLlmCandidate(
  candidate: LlmResolvedPlaceCandidate,
  fallbackName: string,
  context?: string
): ResolvePlaceResult {
  const name = candidate.name?.trim() || fallbackName;
  return {
    id: buildSyntheticPlaceId(name, context),
    name,
    formattedAddress: candidate.formattedAddress?.trim() || name,
    location: {
      lat: candidate.lat,
      lng: candidate.lng,
    },
    category: candidate.category,
    confidence: candidate.confidence,
    city: candidate.city ?? undefined,
  };
}

type LlmPlaceResolver = (
  query: string,
  context?: string,
  anchorPoint?: { lat: number; lng: number }
) => Promise<ResolvePlaceResult[]>;

type SecondaryPlaceResolver = (
  query: string,
  context?: string,
  anchorPoint?: { lat: number; lng: number }
) => Promise<ResolvePlaceResult[]>;

async function defaultLlmPlaceResolver(
  query: string,
  context?: string,
  anchorPoint?: { lat: number; lng: number }
): Promise<ResolvePlaceResult[]> {
  try {
    const { object } = await generateObject({
      model: openai(OPENAI_DEFAULT_MODEL),
      schema: LlmResolvedPlacesSchema,
      prompt: [
        'You are a geocoder.',
        'Return up to 5 plausible real-world places for the query.',
        'If uncertain, return an empty candidates array.',
        'Prefer the provided context and anchor point when available.',
        `Query: "${query}"`,
        `Context: "${context ?? ''}"`,
        anchorPoint ? `Anchor latitude: ${anchorPoint.lat}` : '',
        anchorPoint ? `Anchor longitude: ${anchorPoint.lng}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });

    return object.candidates
      .map((candidate) => toResolveResultFromLlmCandidate(candidate, query, context))
      .filter((candidate) => {
        const validation = validateCoordinate(candidate.location.lat, candidate.location.lng);
        return validation.valid && !isObviouslyInvalid(candidate.location.lat, candidate.location.lng);
      });
  } catch (error) {
    console.warn('[resolve_place] LLM geocoder failed', error);
    return [];
  }
}

let llmPlaceResolver: LlmPlaceResolver = defaultLlmPlaceResolver;

export function __setResolvePlaceLlmResolverForTests(resolver: LlmPlaceResolver | null): void {
  llmPlaceResolver = resolver ?? defaultLlmPlaceResolver;
}

type OpenMeteoGeocodingResponse = {
  results?: Array<{
    id?: number;
    name?: string;
    latitude?: number;
    longitude?: number;
    country?: string;
    admin1?: string;
    feature_code?: string;
  }>;
};

type OpenMeteoCandidate = NonNullable<OpenMeteoGeocodingResponse['results']>[number];

const SECONDARY_GEOCODER_TIMEOUT_MS = 5000;

function mapOpenMeteoFeatureToCategory(
  featureCode?: string
): ResolvePlaceResult['category'] {
  if (!featureCode) return 'other';
  if (featureCode.startsWith('PPL') || featureCode.startsWith('ADM')) return 'city';
  if (featureCode === 'PCLI' || featureCode === 'PCL') return 'country';
  return 'other';
}

function buildOpenMeteoSyntheticId(
  name: string,
  lat: number,
  lng: number
): string {
  const seed = `${normalizePlaceText(name)}|${lat.toFixed(5)}|${lng.toFixed(5)}|openmeteo`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `openmeteo-${Math.abs(hash).toString(36)}`;
}

function toResolveResultFromOpenMeteoCandidate(
  candidate: OpenMeteoCandidate
): ResolvePlaceResult | null {
  const lat = candidate.latitude;
  const lng = candidate.longitude;
  const name = candidate.name?.trim();
  if (!name || typeof lat !== 'number' || !Number.isFinite(lat) || typeof lng !== 'number' || !Number.isFinite(lng)) {
    return null;
  }
  if (isObviouslyInvalid(lat, lng)) return null;

  const category = mapOpenMeteoFeatureToCategory(candidate.feature_code);
  const formattedAddress = [candidate.name, candidate.admin1, candidate.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');

  return {
    id: typeof candidate.id === 'number'
      ? `openmeteo-${candidate.id}`
      : buildOpenMeteoSyntheticId(name, lat, lng),
    name,
    formattedAddress: formattedAddress || name,
    location: { lat, lng },
    category,
    confidence: category === 'city' || category === 'country' ? 0.7 : 0.55,
    city: category === 'city' ? name : undefined,
  };
}

async function defaultSecondaryPlaceResolver(
  query: string,
  context?: string
): Promise<ResolvePlaceResult[]> {
  const combinedQuery = context ? `${query}, ${context}` : query;
  const params = new URLSearchParams({
    name: combinedQuery,
    count: '5',
    language: 'en',
    format: 'json',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SECONDARY_GEOCODER_TIMEOUT_MS);

  try {
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as OpenMeteoGeocodingResponse;
    const rawCandidates = Array.isArray(payload.results) ? payload.results : [];
    if (rawCandidates.length === 0) return [];

    const deduped = new Map<string, ResolvePlaceResult>();
    rawCandidates.forEach((raw) => {
      const mapped = toResolveResultFromOpenMeteoCandidate(raw);
      if (!mapped) return;
      const key = `${mapped.name}|${mapped.location.lat.toFixed(5)}|${mapped.location.lng.toFixed(5)}`;
      if (!deduped.has(key)) {
        deduped.set(key, mapped);
      }
    });

    return Array.from(deduped.values());
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError'
    ) {
      console.warn('[resolve_place] Secondary geocoder timed out');
      return [];
    }
    console.warn('[resolve_place] Secondary geocoder failed', error);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

let secondaryPlaceResolver: SecondaryPlaceResolver = defaultSecondaryPlaceResolver;

export function __setResolvePlaceSecondaryResolverForTests(
  resolver: SecondaryPlaceResolver | null
): void {
  secondaryPlaceResolver = resolver ?? defaultSecondaryPlaceResolver;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

type CanonicalPlaceRow = {
  id: string;
  canonicalName: string;
  formattedAddress: string | null;
  lat: number;
  lng: number;
  category: string | null;
  confidence: number | null;
  city: string | null;
};

type PlaceQueryCacheWithPlace = Prisma.PlaceQueryCacheGetPayload<{
  include: {
    place: {
      include: {
        providerAliases: {
          where: { provider: 'GOOGLE_PLACES' };
          take: 1;
        };
      };
    };
  };
}>;

type PlaceCacheWithCanonical = Prisma.PlaceCacheGetPayload<{
  include: {
    canonicalPlace: {
      include: {
        providerAliases: {
          where: { provider: 'GOOGLE_PLACES' };
          take: 1;
        };
      };
    };
  };
}>;

type PlaceProviderAliasWithPlace = Prisma.PlaceProviderAliasGetPayload<{
  include: { place: true };
}>;

function toResolveResultFromCanonicalPlace(
  place: CanonicalPlaceRow,
  providerPlaceId?: string
): ResolvePlaceResult {
  return {
    id: providerPlaceId ? `gplaces-${providerPlaceId}` : `place-${place.id}`,
    canonicalPlaceId: place.id,
    name: place.canonicalName,
    formattedAddress: place.formattedAddress ?? place.canonicalName,
    location: { lat: place.lat, lng: place.lng },
    category: (place.category as ResolvePlaceResult['category']) ?? 'other',
    confidence: place.confidence ?? 0.9,
    city: place.city ?? undefined,
  };
}

async function checkPlaceQueryCache(
  name: string,
  context?: string
): Promise<ResolvePlaceResult | null> {
  try {
    const key = normalizeCacheKey(name, context);
    const row = (await prisma.placeQueryCache.findUnique({
      where: { name_context: key },
      include: {
        place: {
          include: {
            providerAliases: {
              where: { provider: 'GOOGLE_PLACES' },
              take: 1,
            },
          },
        },
      },
    })) as PlaceQueryCacheWithPlace | null;
    if (!row) return null;
    if (row.expiresAt <= new Date()) return null;

    const providerPlaceId = row.place.providerAliases[0]?.providerPlaceId;
    console.log(`[PlaceQueryCache] HIT: "${name}" in "${context ?? ''}"`);
    return toResolveResultFromCanonicalPlace(row.place, providerPlaceId);
  } catch {
    return null;
  }
}

async function checkPlaceCache(
  name: string,
  context?: string
): Promise<ResolvePlaceResult | null> {
  try {
    const key = normalizeCacheKey(name, context);
    const row = (await prisma.placeCache.findUnique({
      where: { name_context: key },
      include: {
        canonicalPlace: {
          include: {
            providerAliases: {
              where: { provider: 'GOOGLE_PLACES' },
              take: 1,
            },
          },
        },
      },
    })) as PlaceCacheWithCanonical | null;
    if (!row) return null;

    if (row.canonicalPlace) {
      const providerPlaceId =
        row.placeId ?? row.canonicalPlace.providerAliases[0]?.providerPlaceId ?? undefined;
      console.log(`[PlaceCache] HIT (canonical): "${name}" in "${context ?? ''}"`);
      return toResolveResultFromCanonicalPlace(row.canonicalPlace, providerPlaceId);
    }

    if (row.placeId) {
      const alias = (await prisma.placeProviderAlias.findUnique({
        where: {
          provider_providerPlaceId: {
            provider: 'GOOGLE_PLACES',
            providerPlaceId: row.placeId,
          },
        },
        include: {
          place: true,
        },
      })) as PlaceProviderAliasWithPlace | null;
      if (alias) {
        void prisma.placeCache
          .update({
            where: { id: row.id },
            data: { canonicalPlaceId: alias.placeId },
          })
          .catch((error) => {
            console.warn('[PlaceCache] Failed to backfill canonicalPlaceId:', error);
          });

        console.log(`[PlaceCache] HIT (alias backfill): "${name}" in "${context ?? ''}"`);
        return toResolveResultFromCanonicalPlace(alias.place, row.placeId);
      }
    }

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
  result: ResolvePlaceResult,
  canonicalPlaceId?: string | null
): Promise<void> {
  try {
    const key = normalizeCacheKey(name, context);
    const providerPlaceId = parseGooglePlaceId(result.id);
    await prisma.placeCache.upsert({
      where: { name_context: key },
      create: {
        ...key,
        placeId: providerPlaceId,
        canonicalPlaceId: canonicalPlaceId ?? null,
        formattedAddress: result.formattedAddress,
        lat: result.location.lat,
        lng: result.location.lng,
        category: result.category,
        city: result.city ?? null,
        confidence: result.confidence,
      },
      update: {
        placeId: providerPlaceId,
        canonicalPlaceId: canonicalPlaceId ?? null,
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

async function upsertCanonicalPlace(
  queryName: string,
  context: string | undefined,
  result: ResolvePlaceResult
): Promise<string | null> {
  try {
    const now = new Date();
    const placeExpiresAt = new Date(now.getTime() + PLACE_TTL_MS);
    const queryExpiresAt = new Date(now.getTime() + PLACE_QUERY_CACHE_TTL_MS);
    const normalizedName = normalizePlaceText(result.name);
    const country = extractCountryFromContext(context) ?? undefined;
    const providerPlaceId = parseGooglePlaceId(result.id);
    const fingerprint = buildPlaceFingerprint({
      name: result.name,
      lat: result.location.lat,
      lng: result.location.lng,
      city: result.city,
      country,
    });

    let canonicalPlaceId: string;

    if (providerPlaceId) {
      const alias = await prisma.placeProviderAlias.findUnique({
        where: {
          provider_providerPlaceId: {
            provider: 'GOOGLE_PLACES',
            providerPlaceId,
          },
        },
      });

      if (alias) {
        canonicalPlaceId = alias.placeId;
        await prisma.place.update({
          where: { id: canonicalPlaceId },
          data: {
            canonicalName: result.name,
            normalizedName,
            formattedAddress: result.formattedAddress,
            lat: result.location.lat,
            lng: result.location.lng,
            city: result.city ?? null,
            country: country ?? null,
            category: result.category,
            confidence: result.confidence,
            lastValidatedAt: now,
            expiresAt: placeExpiresAt,
          },
        });
      } else {
        const place = await prisma.place.upsert({
          where: { fingerprint },
          create: {
            canonicalName: result.name,
            normalizedName,
            fingerprint,
            formattedAddress: result.formattedAddress,
            lat: result.location.lat,
            lng: result.location.lng,
            city: result.city ?? null,
            country: country ?? null,
            category: result.category,
            confidence: result.confidence,
            lastValidatedAt: now,
            expiresAt: placeExpiresAt,
          },
          update: {
            canonicalName: result.name,
            normalizedName,
            formattedAddress: result.formattedAddress,
            lat: result.location.lat,
            lng: result.location.lng,
            city: result.city ?? null,
            country: country ?? null,
            category: result.category,
            confidence: result.confidence,
            lastValidatedAt: now,
            expiresAt: placeExpiresAt,
          },
          select: { id: true },
        });
        canonicalPlaceId = place.id;

        const aliasAfterUpsert = await prisma.placeProviderAlias.findUnique({
          where: {
            provider_providerPlaceId: {
              provider: 'GOOGLE_PLACES',
              providerPlaceId,
            },
          },
        });

        if (aliasAfterUpsert) {
          canonicalPlaceId = aliasAfterUpsert.placeId;
        } else {
          try {
            const aliasByPlace = await prisma.placeProviderAlias.upsert({
              where: {
                placeId_provider: {
                  placeId: canonicalPlaceId,
                  provider: 'GOOGLE_PLACES',
                },
              },
              create: {
                placeId: canonicalPlaceId,
                provider: 'GOOGLE_PLACES',
                providerPlaceId,
                providerPayloadVersion: 'v1',
              },
              update: {
                providerPlaceId,
                providerPayloadVersion: 'v1',
              },
            });
            canonicalPlaceId = aliasByPlace.placeId;
          } catch (createAliasError) {
            if (!isUniqueConstraintError(createAliasError)) throw createAliasError;

            const concurrentAlias = await prisma.placeProviderAlias.findUnique({
              where: {
                provider_providerPlaceId: {
                  provider: 'GOOGLE_PLACES',
                  providerPlaceId,
                },
              },
            });
            if (concurrentAlias) {
              canonicalPlaceId = concurrentAlias.placeId;
            } else {
              const aliasForPlace = await prisma.placeProviderAlias.findFirst({
                where: {
                  placeId: canonicalPlaceId,
                  provider: 'GOOGLE_PLACES',
                },
              });
              if (aliasForPlace) {
                canonicalPlaceId = aliasForPlace.placeId;
              } else {
                throw createAliasError;
              }
            }
          }
        }

        await prisma.place.update({
          where: { id: canonicalPlaceId },
          data: {
            canonicalName: result.name,
            normalizedName,
            formattedAddress: result.formattedAddress,
            lat: result.location.lat,
            lng: result.location.lng,
            city: result.city ?? null,
            country: country ?? null,
            category: result.category,
            confidence: result.confidence,
            lastValidatedAt: now,
            expiresAt: placeExpiresAt,
          },
        });
      }
    } else {
      const place = await prisma.place.upsert({
        where: { fingerprint },
        create: {
          canonicalName: result.name,
          normalizedName,
          fingerprint,
          formattedAddress: result.formattedAddress,
          lat: result.location.lat,
          lng: result.location.lng,
          city: result.city ?? null,
          country: country ?? null,
          category: result.category,
          confidence: result.confidence,
          lastValidatedAt: now,
          expiresAt: placeExpiresAt,
        },
        update: {
          canonicalName: result.name,
          normalizedName,
          formattedAddress: result.formattedAddress,
          lat: result.location.lat,
          lng: result.location.lng,
          city: result.city ?? null,
          country: country ?? null,
          category: result.category,
          confidence: result.confidence,
          lastValidatedAt: now,
          expiresAt: placeExpiresAt,
        },
        select: { id: true },
      });
      canonicalPlaceId = place.id;
    }

    const key = normalizeCacheKey(queryName, context);
    await prisma.placeQueryCache.upsert({
      where: { name_context: key },
      create: {
        ...key,
        placeId: canonicalPlaceId,
        expiresAt: queryExpiresAt,
      },
      update: {
        placeId: canonicalPlaceId,
        expiresAt: queryExpiresAt,
      },
    });

    return canonicalPlaceId;
  } catch (error) {
    console.warn('[Place] Failed to upsert canonical place:', error);
    return null;
  }
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
      variants.push(`${trimmedName}, ${parts[0]}`);
    }
    variants.push(`${trimmedName}, ${context.trim()}`);
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

async function fetchLlmResolvedPlaceResults(
  query: string,
  context?: string,
  anchorPoint?: { lat: number; lng: number }
): Promise<ResolvePlaceResult[]> {
  return llmPlaceResolver(query, context, anchorPoint);
}

async function fetchSecondaryResolvedPlaceResults(
  query: string,
  context?: string,
  anchorPoint?: { lat: number; lng: number }
): Promise<ResolvePlaceResult[]> {
  return secondaryPlaceResolver(query, context, anchorPoint);
}

function buildInFlightLookupKey(name: string, context?: string): string {
  const key = normalizeCacheKey(name, context);
  return `${key.name}|${key.context}`;
}

async function resolveCandidatesWithCoalescing(options: {
  name: string;
  context?: string;
  cacheKey: string;
  queryVariants: string[];
  anchorPoint?: { lat: number; lng: number };
}): Promise<ResolvePlaceResult[]> {
  const lockKey = buildInFlightLookupKey(options.name, options.context);
  const existing = IN_FLIGHT_LOOKUPS.get(lockKey);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    const queryCached = await checkPlaceQueryCache(options.name, options.context);
    if (queryCached) {
      return [queryCached];
    }

    const dbCached = await checkPlaceCache(options.name, options.context);
    if (dbCached) {
      return [dbCached];
    }

    const memoryCached = GEOCODE_CACHE.get(options.cacheKey) ?? [];
    if (memoryCached.length > 0) {
      return memoryCached;
    }

    for (const query of options.queryVariants) {
      const results = await fetchLlmResolvedPlaceResults(
        query,
        options.context,
        options.anchorPoint
      );
      if (results.length > 0) {
        GEOCODE_CACHE.set(options.cacheKey, results);
        return results;
      }
    }

    for (const query of options.queryVariants) {
      const results = await fetchSecondaryResolvedPlaceResults(
        query,
        options.context,
        options.anchorPoint
      );
      if (results.length > 0) {
        GEOCODE_CACHE.set(options.cacheKey, results);
        return results;
      }
    }
    return [];
  })();

  IN_FLIGHT_LOOKUPS.set(lockKey, task);
  try {
    return await task;
  } finally {
    IN_FLIGHT_LOOKUPS.delete(lockKey);
  }
}

export const resolvePlaceTool = createTool({
  name: 'resolve_place',
  description: 'Convert a place name to geographic coordinates using internal cache and AI fallback.',
  parameters: ResolvePlaceParams,

  async handler(params): Promise<ToolResult<ResolvePlaceResult>> {
    try {
      const queryVariants = buildQueryVariants(params.name, params.context);
      const expectedCity = extractContextCity(params.context);
      const cacheKey = `${params.name}|${params.context || ''}`;

      const candidates = await resolveCandidatesWithCoalescing({
        name: params.name,
        context: params.context,
        cacheKey,
        queryVariants,
        anchorPoint: params.anchorPoint,
      });

      if (candidates.length > 0) {
        const candidateResults = filterResultsByCity(candidates, expectedCity);
        const best = pickBestCandidate(candidateResults, params.anchorPoint);
        if (best) {
          const canonicalPlaceId = await upsertCanonicalPlace(params.name, params.context, best);
          void writePlaceCache(params.name, params.context, best, canonicalPlaceId);
          return {
            success: true,
            data: attachDistanceToAnchor(
              canonicalPlaceId ? { ...best, canonicalPlaceId } : best,
              params.anchorPoint
            ),
          };
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
