import assert from 'node:assert/strict';
import test from 'node:test';

import { searchLocalhostsTool } from './search-localhosts';

test('searchLocalhostsTool returns host results for host search', async () => {
  const result = await searchLocalhostsTool.handler({
    query: 'food tour',
    searchType: 'hosts',
    limit: 3,
  });

  assert.equal(result.success, true);
  if (!result.success) return;

  assert.ok(result.data.results.length > 0);
  assert.equal(result.data.results.length <= 3, true);
  assert.equal(result.data.results.every((item) => item.type === 'host'), true);
  assert.equal(Array.isArray(result.data.results[0].interests), true);
});

test('searchLocalhostsTool normalizes category aliases and returns experience results', async () => {
  const result = await searchLocalhostsTool.handler({
    query: 'local market cooking',
    searchType: 'experiences',
    category: 'food-drink',
    limit: 10,
  });

  assert.equal(result.success, true);
  if (!result.success) return;

  assert.ok(result.data.results.length > 0);
  assert.equal(result.data.results.every((item) => item.type === 'experience'), true);
  assert.equal(
    result.data.results.some((item) => item.category === 'FOOD_DRINK'),
    true
  );
  assert.equal(typeof result.data.results[0].hostName, 'string');
  assert.equal(typeof result.data.results[0].hostId, 'string');
});

test('searchLocalhostsTool enforces result limit for experiences', async () => {
  const result = await searchLocalhostsTool.handler({
    query: 'culture architecture',
    searchType: 'experiences',
    limit: 1,
  });

  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.data.results.length, 1);
  assert.equal(result.data.totalFound, 1);
});

