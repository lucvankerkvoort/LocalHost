import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPlaceImageListUrl,
  buildPlaceImageUrl,
  isPlaceImagesEnabled,
} from './places';

function withPlaceImagesEnv<T>(value: string | undefined, fn: () => T): T {
  const previous = process.env.NEXT_PUBLIC_ENABLE_PLACE_IMAGES;
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_ENABLE_PLACE_IMAGES;
  } else {
    process.env.NEXT_PUBLIC_ENABLE_PLACE_IMAGES = value;
  }

  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_PLACE_IMAGES;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_PLACE_IMAGES = previous;
    }
  }
}

test('place images are disabled by default', () => {
  const enabled = withPlaceImagesEnv(undefined, () => isPlaceImagesEnabled());
  assert.equal(enabled, false);
});

test('buildPlaceImageUrl returns undefined when place images are disabled', () => {
  const url = withPlaceImagesEnv('false', () =>
    buildPlaceImageUrl({
      name: 'Louvre Museum',
      city: 'Paris',
      category: 'museum',
    })
  );
  assert.equal(url, undefined);
});

test('buildPlaceImageUrl builds API URL when place images are enabled', () => {
  const url = withPlaceImagesEnv('true', () =>
    buildPlaceImageUrl({
      name: 'Louvre Museum',
      city: 'Paris',
      category: 'museum',
    })
  );
  assert.ok(typeof url === 'string');
  assert.match(url, /^\/api\/images\/places\?/);
});

test('buildPlaceImageListUrl returns undefined when place images are disabled', () => {
  const url = withPlaceImagesEnv('0', () =>
    buildPlaceImageListUrl({
      name: 'Eiffel Tower',
      city: 'Paris',
      count: 3,
    })
  );
  assert.equal(url, undefined);
});

test('buildPlaceImageListUrl includes itemId and count when place images are enabled', () => {
  const url = withPlaceImagesEnv('true', () =>
    buildPlaceImageListUrl({
      itemId: 'item-123',
      name: 'Rijksmuseum',
      city: 'Amsterdam',
      count: 3,
    })
  );

  assert.ok(url);
  const parsed = new URL(url!, 'https://app.example.com');
  assert.equal(parsed.pathname, '/api/images/places/list');
  assert.equal(parsed.searchParams.get('itemId'), 'item-123');
  assert.equal(parsed.searchParams.get('count'), '3');
  assert.ok(parsed.searchParams.get('sig'));
});
