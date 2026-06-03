import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cityPlanPoolKey,
  cityPlanCursorKey,
  progressKey,
  planPoolTtlSeconds,
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

test('progressKey uses correct prefix', () => {
  assert.equal(progressKey('gen-001'), 'gen:progress:gen-001');
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
// Plan pool key helpers
// ---------------------------------------------------------------------------

test('cityPlanPoolKey uses correct prefix and slugifies inputs', () => {
  assert.equal(cityPlanPoolKey('Paris', 'France', 3), 'city:plans:paris:france:3');
  assert.equal(cityPlanPoolKey('New York', 'United States', 7), 'city:plans:new-york:united-states:7');
});

test('cityPlanCursorKey matches pool key with :cursor suffix', () => {
  assert.equal(cityPlanCursorKey('Paris', 'France', 3), 'city:plans:paris:france:3:cursor');
});

// ---------------------------------------------------------------------------
// planPoolTtlSeconds
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
// Graceful degradation without Redis
// ---------------------------------------------------------------------------

test(
  'getCityPlanFromPool returns null when Redis is unavailable and no Postgres row exists',
  withoutRedis(async () => {
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
    await assert.doesNotReject(() => storeCityPlan('Paris', 'France', 3, minimalPlan as never));
  }),
);
