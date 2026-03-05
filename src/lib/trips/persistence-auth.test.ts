import assert from 'node:assert/strict';
import test from 'node:test';

import { decideTripPlanWriteAccess } from './persistence-auth';

test('user mode allows only matching owner', () => {
  const allowed = decideTripPlanWriteAccess({
    mode: 'user',
    tripExists: true,
    tripOwnerUserId: 'user-1',
    userId: 'user-1',
  });
  assert.deepEqual(allowed, { allowed: true });

  const forbidden = decideTripPlanWriteAccess({
    mode: 'user',
    tripExists: true,
    tripOwnerUserId: 'user-1',
    userId: 'user-2',
  });
  assert.deepEqual(forbidden, { allowed: false, reason: 'forbidden' });
});

test('returns not_found when trip is missing', () => {
  const result = decideTripPlanWriteAccess({
    mode: 'user',
    tripExists: false,
    tripOwnerUserId: null,
    userId: 'user-1',
  });
  assert.deepEqual(result, { allowed: false, reason: 'not_found' });
});

test('internal mode can enforce expected owner identity', () => {
  const mismatch = decideTripPlanWriteAccess({
    mode: 'internal',
    tripExists: true,
    tripOwnerUserId: 'user-1',
    expectedTripOwnerUserId: 'user-2',
  });
  assert.deepEqual(mismatch, { allowed: false, reason: 'owner_mismatch' });

  const ok = decideTripPlanWriteAccess({
    mode: 'internal',
    tripExists: true,
    tripOwnerUserId: 'user-1',
    expectedTripOwnerUserId: 'user-1',
  });
  assert.deepEqual(ok, { allowed: true });
});

