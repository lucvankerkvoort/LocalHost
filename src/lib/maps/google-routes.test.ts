import assert from 'node:assert/strict';
import test from 'node:test';

import { computeGoogleRoutePath } from './google-routes';

test('computeGoogleRoutePath returns fallback for unsupported flight mode', async () => {
  const result = await computeGoogleRoutePath(
    { lat: 34.05, lng: -118.24 },
    { lat: 37.77, lng: -122.42 },
    'flight'
  );

  assert.equal(result.source, 'fallback');
  assert.equal(result.points.length, 2);
});

test('computeGoogleRoutePath decodes Google encoded polyline', async () => {
  const previousKey = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        routes: [
          {
            distanceMeters: 1000,
            duration: '600s',
            polyline: {
              // 3-point canonical polyline example
              encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
            },
          },
        ],
      }),
    }) as Response) as typeof fetch;

  try {
    const result = await computeGoogleRoutePath(
      { lat: 38.5, lng: -120.2 },
      { lat: 43.252, lng: -126.453 },
      'drive'
    );

    assert.equal(result.source, 'google');
    assert.equal(result.points.length, 3);
    assert.equal(result.distanceMeters, 1000);
    assert.equal(result.durationSeconds, 600);
    assert.equal(Math.round(result.points[0].lat * 1000) / 1000, 38.5);
    assert.equal(Math.round(result.points[0].lng * 1000) / 1000, -120.2);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GOOGLE_PLACES_API_KEY = previousKey;
  }
});

