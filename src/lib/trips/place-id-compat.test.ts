import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isMissingPlaceIdColumnError,
  resetPlaceIdCompatibilityCacheForTests,
  supportsItineraryItemPlaceIdColumn,
} from './place-id-compat';

test('isMissingPlaceIdColumnError detects Prisma P2022 missing column messages', () => {
  assert.equal(
    isMissingPlaceIdColumnError({
      code: 'P2022',
      message: 'The column `(not available)` does not exist in the current database.',
    }),
    true
  );

  assert.equal(
    isMissingPlaceIdColumnError({
      code: 'P2022',
      message: 'The column `placeId` does not exist in the current database.',
    }),
    true
  );
});

test('isMissingPlaceIdColumnError ignores non-P2022 errors', () => {
  assert.equal(
    isMissingPlaceIdColumnError({
      code: 'P2002',
      message: 'Unique constraint failed',
    }),
    false
  );
});

test('supportsItineraryItemPlaceIdColumn returns true when placeId exists', async () => {
  resetPlaceIdCompatibilityCacheForTests();
  const result = await supportsItineraryItemPlaceIdColumn({
    $queryRawUnsafe: async <T>() =>
      [{ column_name: 'id' }, { column_name: 'placeId' }] as unknown as T,
  });
  assert.equal(result, true);
});

test('supportsItineraryItemPlaceIdColumn returns false when placeId is absent', async () => {
  resetPlaceIdCompatibilityCacheForTests();
  const result = await supportsItineraryItemPlaceIdColumn({
    $queryRawUnsafe: async <T>() =>
      [{ column_name: 'id' }, { column_name: 'title' }] as unknown as T,
  });
  assert.equal(result, false);
});
