import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __setRouteServiceExternalApiCallerForTests,
  clearRouteCache,
  fetchRoutePolyline,
  fetchRouteWithWaypoints,
} from './route-service';

const ORIGIN = { lat: 34.05, lng: -118.24 };
const TERMINUS = { lat: 36.17, lng: -115.14 };

function buildOkRouteResponse(
  coordinates: Array<[number, number]> = [
    [ORIGIN.lng, ORIGIN.lat],
    [TERMINUS.lng, TERMINUS.lat],
  ]
): Response {
  return new Response(
    JSON.stringify({
      code: 'Ok',
      routes: [
        {
          distance: 123_456,
          duration: 7_890,
          geometry: {
            type: 'LineString',
            coordinates,
          },
        },
      ],
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

test('fetchRoutePolyline parses route response and reuses cache', async () => {
  clearRouteCache();
  let calls = 0;

  __setRouteServiceExternalApiCallerForTests(async () => {
    calls += 1;
    return buildOkRouteResponse();
  });

  try {
    const first = await fetchRoutePolyline(ORIGIN, TERMINUS);
    const second = await fetchRoutePolyline(ORIGIN, TERMINUS);

    assert.ok(first);
    assert.ok(second);
    assert.equal(calls, 1);
    assert.equal(first.polyline.length, 2);
    assert.deepEqual(first.polyline[0], ORIGIN);
    assert.equal(first.distanceMeters, 123_456);
    assert.equal(first.durationSeconds, 7_890);
  } finally {
    __setRouteServiceExternalApiCallerForTests(null);
    clearRouteCache();
  }
});

test('fetchRoutePolyline returns null when upstream response is not ok', async () => {
  clearRouteCache();

  __setRouteServiceExternalApiCallerForTests(async () => new Response('upstream error', { status: 503 }));

  try {
    const result = await fetchRoutePolyline(ORIGIN, TERMINUS, { skipCache: true });
    assert.equal(result, null);
  } finally {
    __setRouteServiceExternalApiCallerForTests(null);
    clearRouteCache();
  }
});

test('fetchRouteWithWaypoints uses OSRM multi-waypoint endpoint metadata', async () => {
  let capturedProvider: string | null = null;
  let capturedEndpoint: string | null = null;
  let capturedMethod: string | null = null;
  let capturedUrl: string | null = null;

  __setRouteServiceExternalApiCallerForTests(async (options) => {
    const meta = options as Record<string, unknown>;
    capturedProvider = typeof meta.provider === 'string' ? meta.provider : null;
    capturedEndpoint = typeof meta.endpoint === 'string' ? meta.endpoint : null;
    capturedMethod = typeof meta.method === 'string' ? meta.method : 'GET';
    capturedUrl = typeof meta.url === 'string' ? meta.url : null;
    return buildOkRouteResponse([
      [ORIGIN.lng, ORIGIN.lat],
      [-117.16, 35.11],
      [TERMINUS.lng, TERMINUS.lat],
    ]);
  });

  try {
    const result = await fetchRouteWithWaypoints([
      ORIGIN,
      { lat: 35.11, lng: -117.16 },
      TERMINUS,
    ]);

    assert.ok(result);
    assert.equal(capturedProvider, 'OSRM');
    assert.equal(capturedEndpoint, 'osrm.routeWithWaypoints');
    assert.equal(capturedMethod, 'GET');
    assert.notEqual(capturedUrl, null);
  } finally {
    __setRouteServiceExternalApiCallerForTests(null);
  }
});
