import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyImageCandidate, type ImageVerificationContext } from './image-verification';
import type { ProviderImageCandidate } from './providers/types';

function makeContext(overrides: Partial<ImageVerificationContext> = {}): ImageVerificationContext {
  return {
    textQuery: 'Louvre Museum Paris',
    name: 'Louvre Museum',
    city: 'Paris',
    country: 'France',
    category: 'museum',
    requestedWidth: 1200,
    requestedHeight: 800,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<ProviderImageCandidate> = {}): ProviderImageCandidate {
  return {
    provider: 'UNSPLASH',
    providerImageId: 'img-1',
    url: 'https://images.example.com/photo.jpg',
    thumbnailUrl: 'https://images.example.com/thumb.jpg',
    width: 1600,
    height: 1066,
    title: 'Louvre Museum facade in Paris',
    description: 'Historic museum architecture in Paris France',
    tags: ['louvre', 'museum', 'paris', 'france', 'architecture'],
    city: 'Paris',
    country: 'France',
    attribution: {
      displayName: 'Photographer',
      uri: 'https://example.com/photographer',
    },
    licenseCode: 'UNSPLASH_LICENSE',
    photographerName: 'Photographer',
    safeFlag: 'SAFE',
    ...overrides,
  };
}

test('verifyImageCandidate rejects when attribution is missing', () => {
  const result = verifyImageCandidate(
    makeCandidate({ attribution: {}, photographerName: undefined }),
    makeContext()
  );

  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasonCodes, ['missing_attribution']);
  assert.equal(result.finalScore, 0);
});

test('verifyImageCandidate rejects disallowed license', () => {
  const result = verifyImageCandidate(
    makeCandidate({ licenseCode: 'UNKNOWN_LICENSE' }),
    makeContext()
  );

  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasonCodes, ['license_disallowed']);
});

test('verifyImageCandidate rejects unsafe content', () => {
  const result = verifyImageCandidate(
    makeCandidate({ safeFlag: 'UNSAFE' }),
    makeContext()
  );

  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasonCodes, ['unsafe_content']);
});

test('verifyImageCandidate does not hard-reject low resolution when relevance is strong', () => {
  const result = verifyImageCandidate(
    makeCandidate({ width: 640, height: 480 }),
    makeContext()
  );

  assert.notEqual(result.status, 'REJECTED');
});

test('verifyImageCandidate accepts high relevance images', () => {
  const result = verifyImageCandidate(makeCandidate(), makeContext());

  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.reasonCodes.includes('deterministic_accept'), true);
  assert.equal(result.deterministicScore >= 0.82, true);
});

test('verifyImageCandidate accepts Wikimedia Commons license code', () => {
  const result = verifyImageCandidate(
    makeCandidate({
      provider: 'WIKIMEDIA_COMMONS',
      providerImageId: 'commons-123',
      licenseCode: 'WIKIMEDIA_COMMONS_LICENSE',
    }),
    makeContext()
  );

  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.reasonCodes.includes('deterministic_accept'), true);
});

test('verifyImageCandidate routes ambiguous images to manual review', () => {
  const result = verifyImageCandidate(
    makeCandidate({
      title: 'Paris city skyline at sunset',
      description: 'Urban skyline with river view',
      tags: ['city', 'paris', 'skyline'],
      city: 'Paris',
      country: 'France',
    }),
    makeContext({ name: 'Louvre', category: undefined })
  );

  assert.equal(result.status, 'REVIEW');
  assert.equal(result.deterministicScore >= 0.45, true);
  assert.equal(result.deterministicScore < 0.82, true);
  assert.equal(result.reasonCodes.includes('review_required'), true);
});

test('verifyImageCandidate rejects low relevance even if metadata is valid', () => {
  const result = verifyImageCandidate(
    makeCandidate({
      title: 'Mountain lake at sunrise',
      description: 'Remote nature landscape in Iceland',
      tags: ['mountain', 'nature', 'landscape'],
      city: 'Reykjavik',
      country: 'Iceland',
    }),
    makeContext()
  );

  assert.equal(result.status, 'REJECTED');
  assert.equal(result.reasonCodes.includes('deterministic_reject'), true);
  assert.equal(result.deterministicScore < 0.45, true);
});
