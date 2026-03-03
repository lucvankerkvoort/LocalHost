import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __setResolvePlaceLlmResolverForTests,
  __setResolvePlaceSecondaryResolverForTests,
  resolvePlaceTool,
} from './resolve-place';

type MockCandidate = {
  id: string;
  name: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  category:
    | 'landmark'
    | 'museum'
    | 'restaurant'
    | 'park'
    | 'neighborhood'
    | 'city'
    | 'country'
    | 'other';
  confidence: number;
  city?: string;
};

function makeCandidate(overrides: Partial<MockCandidate> = {}): MockCandidate {
  return {
    id: 'llm-default',
    name: 'Louvre Museum',
    formattedAddress: 'Louvre Museum, Paris, France',
    location: { lat: 48.8606, lng: 2.3376 },
    category: 'museum',
    confidence: 0.9,
    city: 'Paris',
    ...overrides,
  };
}

test(
  'resolvePlaceTool resolves a place and maps category',
  { concurrency: false },
  async () => {
    const uniqueName = `Louvre ${Date.now()}`;
    __setResolvePlaceLlmResolverForTests(async () => [makeCandidate()]);

    try {
      const result = await resolvePlaceTool.handler({
        name: uniqueName,
        context: 'Paris, France',
      });

      assert.equal(result.success, true);
      if (!result.success) return;

      assert.equal(result.data.category, 'museum');
      assert.equal(result.data.city, 'Paris');
      assert.equal(result.data.id.startsWith('llm-'), true);
      assert.equal(result.data.confidence > 0, true);
    } finally {
      __setResolvePlaceLlmResolverForTests(null);
      __setResolvePlaceSecondaryResolverForTests(null);
    }
  }
);

test(
  'resolvePlaceTool prefers candidate nearest to anchor point',
  { concurrency: false },
  async () => {
    const uniqueName = `Anchor Test Place ${Date.now()}`;
    __setResolvePlaceLlmResolverForTests(async () => [
      makeCandidate({
        id: 'far',
        name: 'Far Candidate',
        location: { lat: 40, lng: -74 },
      }),
      makeCandidate({
        id: 'near',
        name: 'Near Candidate',
        location: { lat: 48.8606, lng: 2.3376 },
      }),
    ]);

    try {
      const result = await resolvePlaceTool.handler({
        name: uniqueName,
        context: 'Paris',
        anchorPoint: { lat: 48.861, lng: 2.338 },
      });

      assert.equal(result.success, true);
      if (!result.success) return;

      assert.equal(result.data.name, 'Near Candidate');
      assert.equal(typeof result.data.distanceToAnchor, 'number');
      assert.equal((result.data.distanceToAnchor ?? 0) < 1000, true);
    } finally {
      __setResolvePlaceLlmResolverForTests(null);
      __setResolvePlaceSecondaryResolverForTests(null);
    }
  }
);

test(
  'resolvePlaceTool uses cache for repeated queries',
  { concurrency: false },
  async () => {
    let resolverCalls = 0;
    __setResolvePlaceLlmResolverForTests(async () => {
      resolverCalls += 1;
      return [makeCandidate({ name: 'Cache Hit' })];
    });

    try {
      const uniqueName = `Cache Place ${Date.now()}`;
      const first = await resolvePlaceTool.handler({ name: uniqueName, context: 'Paris' });
      const second = await resolvePlaceTool.handler({ name: uniqueName, context: 'Paris' });

      assert.equal(first.success, true);
      assert.equal(second.success, true);
      assert.equal(resolverCalls, 1);
    } finally {
      __setResolvePlaceLlmResolverForTests(null);
      __setResolvePlaceSecondaryResolverForTests(null);
    }
  }
);

test(
  'resolvePlaceTool coalesces in-flight duplicate lookups',
  { concurrency: false },
  async () => {
    let resolverCalls = 0;
    __setResolvePlaceLlmResolverForTests(async () => {
      resolverCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return [makeCandidate({ name: 'In Flight Hit' })];
    });

    try {
      const uniqueName = `Concurrent Place ${Date.now()}`;
      const [first, second] = await Promise.all([
        resolvePlaceTool.handler({ name: uniqueName, context: 'Paris' }),
        resolvePlaceTool.handler({ name: uniqueName, context: 'Paris' }),
      ]);

      assert.equal(first.success, true);
      assert.equal(second.success, true);
      assert.equal(resolverCalls, 1);
    } finally {
      __setResolvePlaceLlmResolverForTests(null);
      __setResolvePlaceSecondaryResolverForTests(null);
    }
  }
);

test(
  'resolvePlaceTool falls back to secondary geocoder when LLM has no results',
  { concurrency: false },
  async () => {
    const uniqueName = `Bruges ${Date.now()}`;
    __setResolvePlaceLlmResolverForTests(async () => []);
    __setResolvePlaceSecondaryResolverForTests(async () => [
      makeCandidate({
        id: 'openmeteo-2800931',
        name: 'Bruges',
        formattedAddress: 'Bruges, Flanders, Belgium',
        location: { lat: 51.20892, lng: 3.22424 },
        category: 'city',
        confidence: 0.7,
        city: 'Bruges',
      }),
    ]);

    try {
      const result = await resolvePlaceTool.handler({
        name: uniqueName,
        context: 'Belgium',
      });

      assert.equal(result.success, true);
      if (!result.success) return;

      assert.equal(result.data.name, 'Bruges');
      assert.equal(result.data.category, 'city');
      assert.equal(result.data.id.startsWith('openmeteo-'), true);
    } finally {
      __setResolvePlaceLlmResolverForTests(null);
      __setResolvePlaceSecondaryResolverForTests(null);
    }
  }
);
