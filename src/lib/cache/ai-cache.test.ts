import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cityPoolKey,
  cityPlanPoolKey,
  cityPlanCursorKey,
  progressKey,
  minCityActivities,
  cityPoolTtl,
  planPoolTtlSeconds,
  getCityActivityPool,
  mergeCityActivityPool,
  getCityPlanFromPool,
  storeCityPlan,
  getGenerationProgress,
  setGenerationProgress,
  clearGenerationProgress,
} from './ai-cache';
import { _resetRedisClient } from './redis';

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

test('cityPoolKey uses correct prefix and slugifies city/country', () => {
  assert.equal(cityPoolKey('Paris', 'France'), 'city:inventory:paris:france');
  assert.equal(cityPoolKey('New York', 'United States'), 'city:inventory:new-york:united-states');
  assert.equal(cityPoolKey('  Amsterdam  ', ' Netherlands '), 'city:inventory:amsterdam:netherlands');
});

test('progressKey uses correct prefix', () => {
  assert.equal(progressKey('gen-001'), 'gen:progress:gen-001');
});

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

test('minCityActivities defaults to 12', () => {
  const original = process.env.CACHE_MIN_CITY_ACTIVITIES;
  delete process.env.CACHE_MIN_CITY_ACTIVITIES;
  assert.equal(minCityActivities(), 12);
  if (original !== undefined) process.env.CACHE_MIN_CITY_ACTIVITIES = original;
});

test('minCityActivities respects env override', () => {
  process.env.CACHE_MIN_CITY_ACTIVITIES = '20';
  assert.equal(minCityActivities(), 20);
  delete process.env.CACHE_MIN_CITY_ACTIVITIES;
});

test('cityPoolTtl defaults to 86400', () => {
  const original = process.env.CACHE_TTL_CITY_ACTIVITIES_SECONDS;
  delete process.env.CACHE_TTL_CITY_ACTIVITIES_SECONDS;
  assert.equal(cityPoolTtl(), 86_400);
  if (original !== undefined) process.env.CACHE_TTL_CITY_ACTIVITIES_SECONDS = original;
});

test('cityPoolTtl respects env override', () => {
  process.env.CACHE_TTL_CITY_ACTIVITIES_SECONDS = '3600';
  assert.equal(cityPoolTtl(), 3600);
  delete process.env.CACHE_TTL_CITY_ACTIVITIES_SECONDS;
});

// ---------------------------------------------------------------------------
// Graceful degradation — no Redis configured
// ---------------------------------------------------------------------------

function withoutRedis(fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    const original = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    _resetRedisClient();
    try {
      await fn();
    } finally {
      if (original !== undefined) process.env.REDIS_URL = original;
      _resetRedisClient();
    }
  };
}

const mockActivity = {
  id: 'act-1',
  name: 'Eiffel Tower',
  category: 'landmark',
  lat: 48.8584,
  lng: 2.2945,
  formattedAddress: 'Champ de Mars, Paris',
  cityName: 'Paris',
  country: 'France',
  rating: 4.7,
  priceLevel: 2,
  similarity: 0.9,
  engagementScore: 1.2,
  finalScore: 1.08,
};

test(
  'getCityActivityPool returns null when Redis is unavailable',
  withoutRedis(async () => {
    const result = await getCityActivityPool('Paris', 'France');
    assert.equal(result, null);
  }),
);

test(
  'mergeCityActivityPool is a no-op when Redis is unavailable',
  withoutRedis(async () => {
    await assert.doesNotReject(() => mergeCityActivityPool('Paris', 'France', [mockActivity]));
  }),
);

test(
  'getGenerationProgress returns null when Redis is unavailable',
  withoutRedis(async () => {
    const result = await getGenerationProgress('gen-001');
    assert.equal(result, null);
  }),
);

test(
  'setGenerationProgress is a no-op when Redis is unavailable',
  withoutRedis(async () => {
    await assert.doesNotReject(() =>
      setGenerationProgress('gen-001', {
        status: 'in_progress',
        daysProcessed: 0,
        totalDays: null,
        startedAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
  }),
);

test(
  'clearGenerationProgress is a no-op when Redis is unavailable',
  withoutRedis(async () => {
    await assert.doesNotReject(() => clearGenerationProgress('gen-001'));
  }),
);

// ---------------------------------------------------------------------------
// L2 — Plan pool key helpers
// ---------------------------------------------------------------------------

test('cityPlanPoolKey uses correct prefix and slugifies inputs', () => {
  assert.equal(cityPlanPoolKey('Paris', 'France', 3), 'city:plans:paris:france:3');
  assert.equal(cityPlanPoolKey('New York', 'United States', 7), 'city:plans:new-york:united-states:7');
});

test('cityPlanCursorKey matches pool key with :cursor suffix', () => {
  assert.equal(cityPlanCursorKey('Paris', 'France', 3), 'city:plans:paris:france:3:cursor');
});

// ---------------------------------------------------------------------------
// L2 — planPoolTtlSeconds
// ---------------------------------------------------------------------------

test('planPoolTtlSeconds defaults to 7 days in seconds', () => {
  const original = process.env.CACHE_TTL_PLAN_POOL_DAYS;
  delete process.env.CACHE_TTL_PLAN_POOL_DAYS;
  assert.equal(planPoolTtlSeconds(), 7 * 86_400);
  if (original !== undefined) process.env.CACHE_TTL_PLAN_POOL_DAYS = original;
});

test('planPoolTtlSeconds respects env override', () => {
  process.env.CACHE_TTL_PLAN_POOL_DAYS = '14';
  assert.equal(planPoolTtlSeconds(), 14 * 86_400);
  delete process.env.CACHE_TTL_PLAN_POOL_DAYS;
});

// ---------------------------------------------------------------------------
// L2 — Graceful degradation without Redis
// ---------------------------------------------------------------------------

test(
  'getCityPlanFromPool returns null when Redis is unavailable and no Postgres row exists',
  withoutRedis(async () => {
    // Postgres lookup also returns null (no row seeded in test DB).
    const result = await getCityPlanFromPool('Paris', 'France', 3);
    assert.equal(result, null);
  }),
);

test(
  'storeCityPlan is a no-op when Redis is unavailable and Postgres is unreachable',
  withoutRedis(async () => {
    const minimalPlan = {
      id: 'plan-test-1',
      title: 'Paris in 3 days',
      request: '3 days in Paris',
      days: [],
      summary: 'Test plan',
    };
    // Should not throw even if Postgres write fails (error swallowed).
    await assert.doesNotReject(() => storeCityPlan('Paris', 'France', 3, minimalPlan as never));
  }),
);
