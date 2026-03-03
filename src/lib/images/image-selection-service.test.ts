import assert from 'node:assert/strict';
import test from 'node:test';

import { __buildVerificationLogRowsForTests } from './image-selection-service';

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
