import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProviderImageCandidate } from './providers/types';
import {
  __buildFastPathCandidatePoolForTests,
  __resolveProviderQueriesForTests,
  __buildVerificationLogRowsForTests,
} from './image-selection-service';

function buildCandidate(
  provider: ProviderImageCandidate['provider'],
  providerImageId: string,
  url: string
): ProviderImageCandidate {
  return {
    provider,
    providerImageId,
    url,
    width: 1200,
    height: 800,
    tags: [],
    attribution: {},
    licenseCode: `${provider}_LICENSE`,
    safeFlag: 'UNKNOWN',
  };
}

test('buildVerificationLogRows sorts by score descending and includes status/reasons', () => {
  const rows = __buildVerificationLogRowsForTests([
    {
      candidate: {
        providerImageId: 'img-low',
        title: 'Low score image',
        description: 'desc',
        city: 'Paris',
        country: 'France',
      },
      status: 'REJECTED',
      finalScore: 0.12,
      deterministicScore: 0.12,
      reasonCodes: ['deterministic_reject'],
    },
    {
      candidate: {
        providerImageId: 'img-top',
        title: 'Top score image',
        description: 'desc',
        city: 'Paris',
        country: 'France',
      },
      status: 'VERIFIED',
      finalScore: 0.93,
      deterministicScore: 0.93,
      reasonCodes: ['deterministic_accept'],
    },
    {
      candidate: {
        providerImageId: 'img-mid',
        title: 'Mid score image',
        description: 'desc',
        city: 'Paris',
        country: 'France',
      },
      status: 'REVIEW',
      finalScore: 0.58,
      deterministicScore: 0.58,
      reasonCodes: ['review_required'],
    },
  ]);

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.rank), [1, 2, 3]);
  assert.deepEqual(rows.map((row) => row.providerImageId), ['img-top', 'img-mid', 'img-low']);
  assert.deepEqual(rows.map((row) => row.status), ['VERIFIED', 'REVIEW', 'REJECTED']);
  assert.deepEqual(rows.map((row) => row.reasonCodes[0]), [
    'deterministic_accept',
    'review_required',
    'deterministic_reject',
  ]);
});

test('buildVerificationLogRows uses status as tie-breaker when scores match', () => {
  const rows = __buildVerificationLogRowsForTests([
    {
      candidate: {
        providerImageId: 'img-rejected',
        title: 'Rejected',
        description: 'desc',
        city: 'Paris',
        country: 'France',
      },
      status: 'REJECTED',
      finalScore: 0.8,
      deterministicScore: 0.8,
      reasonCodes: ['deterministic_reject'],
    },
    {
      candidate: {
        providerImageId: 'img-verified',
        title: 'Verified',
        description: 'desc',
        city: 'Paris',
        country: 'France',
      },
      status: 'VERIFIED',
      finalScore: 0.8,
      deterministicScore: 0.8,
      reasonCodes: ['deterministic_accept'],
    },
    {
      candidate: {
        providerImageId: 'img-review',
        title: 'Review',
        description: 'desc',
        city: 'Paris',
        country: 'France',
      },
      status: 'REVIEW',
      finalScore: 0.8,
      deterministicScore: 0.8,
      reasonCodes: ['review_required'],
    },
  ]);

  assert.deepEqual(rows.map((row) => row.providerImageId), [
    'img-verified',
    'img-review',
    'img-rejected',
  ]);
});

test('buildFastPathCandidatePool keeps provider priority order and deduplicates exact repeats', () => {
  const wikipedia = [
    buildCandidate('WIKIMEDIA_COMMONS', 'wiki-1', 'https://img.example.com/wiki-1.jpg'),
  ];
  const unsplash = [
    buildCandidate('UNSPLASH', 'u-1', 'https://img.example.com/u-1.jpg'),
    buildCandidate('UNSPLASH', 'u-1', 'https://img.example.com/u-1.jpg'),
    buildCandidate('UNSPLASH', 'shared', 'https://img.example.com/shared.jpg'),
  ];
  const pexels = [
    buildCandidate('PEXELS', 'p-1', 'https://img.example.com/p-1.jpg'),
    buildCandidate('PEXELS', 'shared', 'https://img.example.com/shared.jpg'),
  ];
  const wikimedia = [
    buildCandidate('WIKIMEDIA_COMMONS', 'w-1', 'https://img.example.com/w-1.jpg'),
  ];

  const pool = __buildFastPathCandidatePoolForTests([
    wikipedia,
    wikimedia,
    unsplash,
    pexels,
  ]);

  assert.deepEqual(
    pool.map((candidate) => `${candidate.provider}:${candidate.providerImageId}`),
    [
      'WIKIMEDIA_COMMONS:wiki-1',
      'WIKIMEDIA_COMMONS:w-1',
      'UNSPLASH:u-1',
      'UNSPLASH:shared',
      'PEXELS:p-1',
      'PEXELS:shared',
    ]
  );
});

test('resolveProviderQueries favors sights for wiki sources and vibes for stock sources', () => {
  const result = __resolveProviderQueriesForTests({
    textQuery: 'Tunnel View Yosemite National Park',
    name: 'Tunnel View',
    city: 'Yosemite',
    country: 'United States',
    category: 'landmark',
    width: 600,
    height: 400,
    count: 1,
  });

  assert.equal(result.useSightSources, true);
  assert.equal(result.sightTextQuery, 'Tunnel View Yosemite United States');
  assert.match(result.vibeTextQuery, /hiking/i);
});

test('resolveProviderQueries skips sight providers for generic meal queries', () => {
  const result = __resolveProviderQueriesForTests({
    textQuery: 'Dinner in downtown',
    city: 'Los Angeles',
    country: 'United States',
    category: 'restaurant',
    width: 600,
    height: 400,
    count: 1,
  });

  assert.equal(result.useSightSources, false);
  assert.match(result.vibeTextQuery, /food/i);
});
