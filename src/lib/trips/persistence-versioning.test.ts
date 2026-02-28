import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveNextTripVersion, TripVersionConflictError } from './versioning';

test('resolveNextTripVersion increments version when expectedVersion is omitted', () => {
  const result = resolveNextTripVersion({
    currentVersion: 4,
  });

  assert.equal(result.currentVersion, 4);
  assert.equal(result.nextVersion, 5);
});

test('resolveNextTripVersion increments version when expectedVersion matches', () => {
  const result = resolveNextTripVersion({
    currentVersion: 9,
    expectedVersion: 9,
  });

  assert.equal(result.currentVersion, 9);
  assert.equal(result.nextVersion, 10);
});

test('resolveNextTripVersion throws conflict when expectedVersion mismatches', () => {
  assert.throws(
    () =>
      resolveNextTripVersion({
        currentVersion: 3,
        expectedVersion: 2,
      }),
    (error: unknown) =>
      error instanceof TripVersionConflictError &&
      error.expectedVersion === 2 &&
      error.currentVersion === 3
  );
});
