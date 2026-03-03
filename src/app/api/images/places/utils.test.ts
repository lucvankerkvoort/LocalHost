import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTextQuery,
  fallbackImageUrl,
  parseCount,
  parseDimensions,
} from './utils';

test('buildTextQuery prefers explicit query and sanitizes punctuation', () => {
  const result = buildTextQuery({
    rawQuery: 'Louvre Museum (Paris)!!!',
    name: 'ignored name',
    city: 'ignored city',
  });

  assert.equal(result, 'Louvre Museum');
});

test('buildTextQuery avoids generic names and falls back to category + city', () => {
  const result = buildTextQuery({
    name: 'free time',
    category: 'museum',
    city: 'Paris',
  });

  assert.equal(result, 'museum Paris');
});

test('buildTextQuery appends description context to reduce ambiguity', () => {
  const result = buildTextQuery({
    name: 'Keys View',
    city: 'Joshua Tree',
    description: 'Joshua Tree National Park scenic overlook',
  });

  assert.equal(result, 'Keys View Joshua Tree Joshua Tree National Park scenic overlook');
});

test('parseDimensions clamps values to supported bounds', () => {
  const params = new URLSearchParams({ w: '99999', h: '50' });
  const dims = parseDimensions(params);

  assert.deepEqual(dims, { width: 1600, height: 200 });
});

test('parseCount clamps and rounds user input', () => {
  const params = new URLSearchParams({ count: '12.2' });
  const count = parseCount(params);

  assert.equal(count, 10);
});

test('fallbackImageUrl resolves against request origin', () => {
  const request = new Request('https://app.example.com/api/images/places?query=test');
  const fallback = fallbackImageUrl(request);

  assert.equal(fallback, 'https://app.example.com/globe.svg');
});
