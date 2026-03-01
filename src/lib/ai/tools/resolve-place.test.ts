import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePlaceTool } from './resolve-place';

type GooglePlace = {
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

function makeGooglePlace(overrides: Partial<GooglePlace> = {}): GooglePlace {
  return {
    id: 'test-place-id',
    displayName: { text: 'Louvre Museum' },
    formattedAddress: 'Louvre Museum, Paris, France',
    location: { latitude: 48.8606, longitude: 2.3376 },
    types: ['museum', 'point_of_interest'],
    addressComponents: [
      { longText: 'Paris', types: ['locality'] },
      { longText: 'France', types: ['country'] },
    ],
    ...overrides,
  };
}

function installGoogleFetchMock(
  handler: (input: URL, init?: RequestInit) => Promise<GooglePlace[]>
): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : String(input);
    if (!rawUrl.includes('places.googleapis.com/v1/places:searchText')) {
      return originalFetch(input as RequestInfo | URL, init);
    }
    const url = new URL(rawUrl);
    const places = await handler(url, init);
    return {
      ok: true,
      status: 200,
      json: async () => ({ places }),
    } as Response;
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

test(
  'resolvePlaceTool resolves a place and maps Google category',
  { concurrency: false },
  async () => {
    const previousKey = process.env.GOOGLE_PLACES_API_KEY;
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    const restoreFetch = installGoogleFetchMock(async () => [makeGooglePlace()]);

    try {
      const result = await resolvePlaceTool.handler({
        name: 'Louvre',
        context: 'Paris, France',
      });

      assert.equal(result.success, true);
      if (!result.success) return;

      assert.equal(result.data.category, 'museum');
      assert.equal(result.data.city, 'Paris');
      assert.equal(result.data.id, 'gplaces-test-place-id');
      assert.equal(result.data.confidence > 0, true);
    } finally {
      restoreFetch();
      process.env.GOOGLE_PLACES_API_KEY = previousKey;
    }
  }
);

test(
  'resolvePlaceTool prefers candidate nearest to anchor point',
  { concurrency: false },
  async () => {
    const previousKey = process.env.GOOGLE_PLACES_API_KEY;
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    const restoreFetch = installGoogleFetchMock(async () => [
      makeGooglePlace({
        id: 'far',
        displayName: { text: 'Far Candidate' },
        location: { latitude: 40, longitude: -74 },
      }),
      makeGooglePlace({
        id: 'near',
        displayName: { text: 'Near Candidate' },
        location: { latitude: 48.8606, longitude: 2.3376 },
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

      assert.equal(result.data.id, 'gplaces-near');
      assert.equal(typeof result.data.distanceToAnchor, 'number');
      assert.equal((result.data.distanceToAnchor ?? 0) < 1000, true);
    } finally {
      restoreFetch();
      process.env.GOOGLE_PLACES_API_KEY = previousKey;
    }
  }
);

test(
  'resolvePlaceTool uses cache for repeated queries',
  { concurrency: false },
  async () => {
    const previousKey = process.env.GOOGLE_PLACES_API_KEY;
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    let fetchCalls = 0;
    const restoreFetch = installGoogleFetchMock(async () => {
      fetchCalls += 1;
      return [makeGooglePlace({ id: 'cache-hit' })];
    });

    try {
      const uniqueName = `Cache Place ${Date.now()}`;
      const first = await resolvePlaceTool.handler({ name: uniqueName, context: 'Paris' });
      const second = await resolvePlaceTool.handler({ name: uniqueName, context: 'Paris' });

      assert.equal(first.success, true);
      assert.equal(second.success, true);
      assert.equal(fetchCalls, 1);
    } finally {
      restoreFetch();
      process.env.GOOGLE_PLACES_API_KEY = previousKey;
    }
  }
);
