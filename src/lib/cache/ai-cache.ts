import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ActivitySearchResult } from '@/lib/db/activity-search';
import { ItineraryPlanSchema, type ItineraryPlan } from '@/lib/ai/types';
import { getRedisClient } from './redis';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CITY_POOL_TTL_SECONDS = 86_400; // 24 h
const DEFAULT_MIN_CITY_ACTIVITIES = 12;
const PROGRESS_TTL_SECONDS = 3_600; // 1 h
const DEFAULT_PLAN_POOL_TTL_DAYS = 7;
const PLAN_POOL_MAX_SIZE = 5;

export function cityPoolTtl(): number {
  const env = process.env.CACHE_TTL_CITY_ACTIVITIES_SECONDS;
  if (!env) return DEFAULT_CITY_POOL_TTL_SECONDS;
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CITY_POOL_TTL_SECONDS;
}

export function planPoolTtlSeconds(): number {
  const env = process.env.CACHE_TTL_PLAN_POOL_DAYS;
  if (!env) return DEFAULT_PLAN_POOL_TTL_DAYS * 86_400;
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? n * 86_400 : DEFAULT_PLAN_POOL_TTL_DAYS * 86_400;
}

export function minCityActivities(): number {
  const env = process.env.CACHE_MIN_CITY_ACTIVITIES;
  if (!env) return DEFAULT_MIN_CITY_ACTIVITIES;
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MIN_CITY_ACTIVITIES;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * Mirrors ActivitySearchResult from @/lib/db/activity-search.
 * Defined here so the cache layer can validate on read without a circular dep.
 */
export const ActivitySearchResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  lat: z.number(),
  lng: z.number(),
  formattedAddress: z.string(),
  cityName: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  rating: z.number().nullable(),
  priceLevel: z.number().nullable(),
  similarity: z.number(),
  engagementScore: z.number(),
  finalScore: z.number(),
});

export const CityActivityPoolSchema = z.object({
  city: z.string(),
  country: z.string(),
  activities: z.array(ActivitySearchResultSchema),
  updatedAt: z.number(),
});
export type CityActivityPool = z.infer<typeof CityActivityPoolSchema>;

export const GenerationProgressSchema = z.object({
  status: z.enum(['in_progress', 'complete', 'failed']),
  daysProcessed: z.number(),
  totalDays: z.number().nullable(),
  startedAt: z.number(),
  updatedAt: z.number(),
});
export type GenerationProgress = z.infer<typeof GenerationProgressSchema>;

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '-');
}

export function cityPoolKey(city: string, country: string): string {
  return `city:inventory:${slug(city)}:${slug(country)}`;
}

export function progressKey(generationId: string): string {
  return `gen:progress:${generationId}`;
}

/** Kept for tests that need a stable hash for a given city+country pair. */
export function hashCity(city: string, country: string): string {
  return createHash('sha256').update(`${slug(city)}:${slug(country)}`).digest('hex');
}

export function cityPlanPoolKey(city: string, country: string, durationDays: number): string {
  return `city:plans:${slug(city)}:${slug(country)}:${durationDays}`;
}

export function cityPlanCursorKey(city: string, country: string, durationDays: number): string {
  return `city:plans:${slug(city)}:${slug(country)}:${durationDays}:cursor`;
}

// ---------------------------------------------------------------------------
// City activity pool
// ---------------------------------------------------------------------------

/**
 * Returns the cached activity pool for a city, or null if not present / too small.
 * Callers should check pool.length >= minCityActivities() themselves if they
 * need to decide whether to fall through to the DB.
 */
export async function getCityActivityPool(
  city: string,
  country: string,
): Promise<ActivitySearchResult[] | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const raw = await client.get(cityPoolKey(city, country));
    if (!raw) return null;

    const result = CityActivityPoolSchema.safeParse(JSON.parse(raw));
    if (!result.success) {
      console.warn(`[Cache] Corrupted city pool for ${city}, ignoring`);
      return null;
    }
    return result.data.activities as ActivitySearchResult[];
  } catch (err) {
    console.warn('[Cache] getCityActivityPool error:', err);
    return null;
  }
}

/**
 * Merges new activities into the city's Redis pool (deduplicated by id).
 * Refreshes the TTL on every write. Safe to fire-and-forget.
 */
export async function mergeCityActivityPool(
  city: string,
  country: string,
  newActivities: ActivitySearchResult[],
): Promise<void> {
  const client = getRedisClient();
  if (!client || !newActivities.length) return;

  try {
    const existing = (await getCityActivityPool(city, country)) ?? [];
    const merged = Array.from(
      new Map([...existing, ...newActivities].map((a) => [a.id, a])).values(),
    );

    const pool: CityActivityPool = {
      city,
      country,
      activities: merged,
      updatedAt: Date.now(),
    };

    await client.set(cityPoolKey(city, country), JSON.stringify(pool), 'EX', cityPoolTtl());
    console.log(`[Cache] City pool updated: ${city} (${merged.length} activities)`);
  } catch (err) {
    console.warn('[Cache] mergeCityActivityPool error:', err);
  }
}

// ---------------------------------------------------------------------------
// L2: City plan pool (Redis hot + Postgres durable)
// ---------------------------------------------------------------------------

const CityPlanPoolSchema = z.array(ItineraryPlanSchema);

/**
 * Attempt to hydrate the Redis plan pool from Postgres for the given city/duration.
 * Called automatically on a Redis cold-start miss.
 */
async function hydrateFromPostgres(
  city: string,
  country: string,
  durationDays: number,
): Promise<ItineraryPlan[] | null> {
  try {
    // Lazy import to avoid circular dep issues at module load time.
    const { prisma } = await import('@/lib/prisma');
    const row = await prisma.cityPlanCache.findUnique({
      where: { city_country_durationDays: { city, country, durationDays } },
    });

    if (!row || new Date(row.expiresAt) < new Date()) return null;

    const result = CityPlanPoolSchema.safeParse(row.plans);
    if (!result.success) {
      console.warn(`[Cache] Corrupted CityPlanCache row for ${city}/${durationDays}d, ignoring`);
      return null;
    }

    const client = getRedisClient();
    if (client && result.data.length > 0) {
      const ttl = Math.max(
        0,
        Math.floor((new Date(row.expiresAt).getTime() - Date.now()) / 1_000),
      );
      await client.set(
        cityPlanPoolKey(city, country, durationDays),
        JSON.stringify(result.data),
        'EX',
        ttl,
      );
      console.log(`[Cache] Plan pool hydrated from Postgres for ${city} ${durationDays}d (${result.data.length} plans)`);
    }

    return result.data;
  } catch (err) {
    console.warn('[Cache] hydrateFromPostgres error:', err);
    return null;
  }
}

/**
 * Returns the next plan from the pool for this city/duration, rotating round-robin.
 * Falls through to Postgres on a Redis cold start. Returns null if pool is empty.
 */
export async function getCityPlanFromPool(
  city: string,
  country: string,
  durationDays: number,
): Promise<ItineraryPlan | null> {
  let plans: ItineraryPlan[] | null = null;

  const client = getRedisClient();
  if (client) {
    try {
      const raw = await client.get(cityPlanPoolKey(city, country, durationDays));
      if (raw) {
        const result = CityPlanPoolSchema.safeParse(JSON.parse(raw));
        if (result.success && result.data.length > 0) {
          plans = result.data;
        } else if (!result.success) {
          console.warn(`[Cache] Corrupted plan pool for ${city}/${durationDays}d, ignoring`);
        }
      }
    } catch (err) {
      console.warn('[Cache] getCityPlanFromPool Redis read error:', err);
    }
  }

  // Redis cold start: try Postgres.
  if (!plans) {
    plans = await hydrateFromPostgres(city, country, durationDays);
  }

  if (!plans || plans.length === 0) return null;

  // Advance cursor round-robin.
  let cursor = 0;
  if (client) {
    try {
      const cursorKey = cityPlanCursorKey(city, country, durationDays);
      const raw = await client.get(cursorKey);
      cursor = raw ? Number(raw) % plans.length : 0;
      const next = (cursor + 1) % plans.length;
      await client.set(cursorKey, String(next), 'EX', planPoolTtlSeconds());
    } catch (err) {
      console.warn('[Cache] getCityPlanFromPool cursor error:', err);
    }
  }

  console.log(`[Cache] Plan pool hit for ${city} ${durationDays}d (pool=${plans.length}, cursor=${cursor})`);
  return plans[cursor] ?? null;
}

/**
 * Stores a newly generated plan in the pool (Redis + Postgres).
 * Capped at PLAN_POOL_MAX_SIZE — no new plans stored once pool is full.
 * Safe to call fire-and-forget (errors are swallowed).
 */
export async function storeCityPlan(
  city: string,
  country: string,
  durationDays: number,
  plan: ItineraryPlan,
): Promise<void> {
  try {
    // Read existing pool to check capacity and deduplicate.
    const client = getRedisClient();
    let existing: ItineraryPlan[] = [];

    if (client) {
      try {
        const raw = await client.get(cityPlanPoolKey(city, country, durationDays));
        if (raw) {
          const result = CityPlanPoolSchema.safeParse(JSON.parse(raw));
          if (result.success) existing = result.data;
        }
      } catch {
        // Redis read failure — fall through to Postgres-only path.
      }
    }

    if (existing.length === 0) {
      // Redis miss: check Postgres for existing pool.
      const fromDb = await hydrateFromPostgres(city, country, durationDays);
      if (fromDb) existing = fromDb;
    }

    if (existing.length >= PLAN_POOL_MAX_SIZE) {
      console.log(`[Cache] Plan pool full for ${city} ${durationDays}d (${PLAN_POOL_MAX_SIZE} plans) — skipping store`);
      return;
    }

    const updated = [...existing, plan];
    const expiresAt = new Date(Date.now() + planPoolTtlSeconds() * 1_000);

    // Write to Redis.
    if (client) {
      try {
        await client.set(
          cityPlanPoolKey(city, country, durationDays),
          JSON.stringify(updated),
          'EX',
          planPoolTtlSeconds(),
        );
      } catch (err) {
        console.warn('[Cache] storeCityPlan Redis write error:', err);
      }
    }

    // Write-through to Postgres.
    const { prisma } = await import('@/lib/prisma');
    await prisma.cityPlanCache.upsert({
      where: { city_country_durationDays: { city, country, durationDays } },
      update: { plans: updated as object[], updatedAt: new Date(), expiresAt },
      create: { city, country, durationDays, plans: updated as object[], expiresAt },
    });

    console.log(`[Cache] Plan stored for ${city} ${durationDays}d (pool now ${updated.length}/${PLAN_POOL_MAX_SIZE})`);
  } catch (err) {
    console.warn('[Cache] storeCityPlan error:', err);
  }
}

// ---------------------------------------------------------------------------
// Generation progress
// ---------------------------------------------------------------------------

export async function setGenerationProgress(
  generationId: string,
  progress: GenerationProgress,
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.set(progressKey(generationId), JSON.stringify(progress), 'EX', PROGRESS_TTL_SECONDS);
  } catch (err) {
    console.warn('[Cache] setGenerationProgress error:', err);
  }
}

export async function getGenerationProgress(
  generationId: string,
): Promise<GenerationProgress | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const raw = await client.get(progressKey(generationId));
    if (!raw) return null;
    const result = GenerationProgressSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch (err) {
    console.warn('[Cache] getGenerationProgress error:', err);
    return null;
  }
}

export async function clearGenerationProgress(generationId: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.del(progressKey(generationId));
  } catch (err) {
    console.warn('[Cache] clearGenerationProgress error:', err);
  }
}
