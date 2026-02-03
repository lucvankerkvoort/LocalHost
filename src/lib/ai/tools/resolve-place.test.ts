import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePlaceTool } from './resolve-place';

type MockResult = {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  class: string;
  type: string;
  importance: number;
  name: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
};

function makeNominatimResult(overrides: Partial<MockResult> = {}): MockResult {
  return {
    osm_type: 'way',
    osm_id: 1,
    lat: '48.8606',
    lon: '2.3376',
    class: 'tourism',
    type: 'museum',
    importance: 0.8,
    name: 'Louvre Museum',
    display_name: 'Louvre Museum, Paris, France',
    address: { city: 'Paris', country: 'France' },
    ...overrides,
  };
}

function installFetchMock(
  handler: (input: URL) => Promise<MockResult[]>
): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? new URL(input) : new URL((input as URL).toString());
    const jsonPayload = await handler(url);
    return {
      ok: true,
      status: 200,
      json: async () => jsonPayload,
    } as Response;
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

test(
  'resolvePlaceTool resolves a place and maps geocoding category',
  { concurrency: false },
  async () => {
    const restoreFetch = installFetchMock(async () => [makeNominatimResult()]);

    try {
      const result = await resolvePlaceTool.handler({
        name: 'Louvre',
        context: 'Paris, France',
      });

      assert.equal(result.success, true);
      if (!result.success) return;

      assert.equal(result.data.category, 'museum');
      assert.equal(result.data.city, 'Paris');
      assert.equal(result.data.id, 'osm-way-1');
      assert.equal(result.data.confidence > 0, true);
    } finally {
      restoreFetch();
    }
  }
);

test(
  'resolvePlaceTool prefers candidate nearest to anchor point',
  { concurrency: false },
  async () => {
    const restoreFetch = installFetchMock(async () => [
      makeNominatimResult({
        osm_id: 100,
        name: 'Far Candidate',
        lat: '40.0000',
        lon: '-74.0000',
      }),
      makeNominatimResult({
        osm_id: 200,
        name: 'Near Candidate',
        lat: '48.8606',
        lon: '2.3376',
      }),
    ]);

    try {
      const result = await resolvePlaceTool.handler({
        name: 'Anchor Test Place',
        context: 'Paris',
        anchorPoint: { lat: 48.861, lng: 2.338 },
      });

      assert.equal(result.success, true);
      if (!result.success) return;

      assert.equal(result.data.id, 'osm-way-200');
      assert.equal(typeof result.data.distanceToAnchor, 'number');
      assert.equal((result.data.distanceToAnchor ?? 0) < 1000, true);
    } finally {
      restoreFetch();
    }
  }
);

test(
  'resolvePlaceTool uses cache for repeated queries',
  { concurrency: false },
  async () => {
    let fetchCalls = 0;
    const uniqueName = `Cache Place ${Date.now()}`;
    const restoreFetch = installFetchMock(async () => {
      fetchCalls += 1;
      return [makeNominatimResult({ osm_id: 300, name: uniqueName })];
    });

    try {
      const first = await resolvePlaceTool.handler({ name: uniqueName, context: 'Paris' });
      const second = await resolvePlaceTool.handler({ name: uniqueName, context: 'Paris' });

      assert.equal(first.success, true);
      assert.equal(second.success, true);
      assert.equal(fetchCalls, 1);
    } finally {
      restoreFetch();
    }
  }
);

