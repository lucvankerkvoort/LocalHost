import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __clearUnsplashListRouteCacheForTests,
  __setUnsplashListRouteExternalApiCallerForTests,
  GET,
} from './route';

test('unsplash list route uses external API gateway and returns image list', async () => {
  const previousKey = process.env.UNSPLASH_ACCESS_KEY;
  process.env.UNSPLASH_ACCESS_KEY = 'test-unsplash-key';
  __clearUnsplashListRouteCacheForTests();

  let capturedProvider: string | null = null;
  let capturedEndpoint: string | null = null;

  __setUnsplashListRouteExternalApiCallerForTests(async (options) => {
    const meta = options as Record<string, unknown>;
    capturedProvider = typeof meta.provider === 'string' ? meta.provider : null;
    capturedEndpoint = typeof meta.endpoint === 'string' ? meta.endpoint : null;
    return new Response(
      JSON.stringify({
        results: [
          {
            urls: {
              raw: 'https://images.unsplash.com/photo-1',
            },
          },
          {
            urls: {
              raw: 'https://images.unsplash.com/photo-2',
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
        'https://app.example.com/api/images/unsplash/list?query=hiking&city=Yosemite&count=2&w=700&h=400'
      )
    );
    const payload = (await response.json()) as { images?: string[] };

    assert.equal(response.status, 200);
    assert.equal(capturedProvider, 'UNSPLASH');
    assert.equal(capturedEndpoint, 'unsplash.searchPhotos.list');
    assert.equal(Array.isArray(payload.images), true);
    assert.equal(payload.images?.length, 2);
    assert.ok(payload.images?.[0]?.includes('w=700'));
    assert.ok(payload.images?.[0]?.includes('h=400'));
  } finally {
    __setUnsplashListRouteExternalApiCallerForTests(null);
    __clearUnsplashListRouteCacheForTests();
    process.env.UNSPLASH_ACCESS_KEY = previousKey;
  }
});
