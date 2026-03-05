import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __clearUnsplashRouteCacheForTests,
  __setUnsplashRouteExternalApiCallerForTests,
  GET,
} from './route';

test('unsplash redirect route uses external API gateway and returns image redirect', async () => {
  const previousKey = process.env.UNSPLASH_ACCESS_KEY;
  process.env.UNSPLASH_ACCESS_KEY = 'test-unsplash-key';
  __clearUnsplashRouteCacheForTests();

  let capturedProvider: string | null = null;
  let capturedEndpoint: string | null = null;

  __setUnsplashRouteExternalApiCallerForTests(async (options) => {
    const meta = options as Record<string, unknown>;
    capturedProvider = typeof meta.provider === 'string' ? meta.provider : null;
    capturedEndpoint = typeof meta.endpoint === 'string' ? meta.endpoint : null;
    return new Response(
      JSON.stringify({
        results: [
          {
            urls: {
              raw: 'https://images.unsplash.com/photo-test',
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  });

  try {
    const response = await GET(
      new Request(
        'https://app.example.com/api/images/unsplash?query=Rijksmuseum&city=Amsterdam&w=800&h=500'
      )
    );
    const location = response.headers.get('location');

    assert.equal(response.status, 307);
    assert.equal(capturedProvider, 'UNSPLASH');
    assert.equal(capturedEndpoint, 'unsplash.searchPhotos.redirect');
    assert.ok(location);
    assert.ok(location?.includes('w=800'));
    assert.ok(location?.includes('h=500'));
  } finally {
    __setUnsplashRouteExternalApiCallerForTests(null);
    __clearUnsplashRouteCacheForTests();
    process.env.UNSPLASH_ACCESS_KEY = previousKey;
  }
});
