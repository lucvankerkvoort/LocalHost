import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractRequestedDurationDays,
  minimumInventoryCountForStrictDraft,
  shouldEnforceStrictInventoryDraft,
} from './inventory-draft-policy';

test('extractRequestedDurationDays parses common day formats', () => {
  assert.equal(extractRequestedDurationDays('15 day europe trip'), 15);
  assert.equal(extractRequestedDurationDays('Plan a 7-day road trip'), 7);
  assert.equal(extractRequestedDurationDays('Need 3 days in Rome'), 3);
  assert.equal(extractRequestedDurationDays('No duration provided'), null);
});

test('minimumInventoryCountForStrictDraft scales with duration and is bounded', () => {
  assert.equal(minimumInventoryCountForStrictDraft(null), 10);
  assert.equal(minimumInventoryCountForStrictDraft(2), 10);
  assert.equal(minimumInventoryCountForStrictDraft(10), 15);
  assert.equal(minimumInventoryCountForStrictDraft(15), 23);
  assert.equal(minimumInventoryCountForStrictDraft(100), 40);
});

test('shouldEnforceStrictInventoryDraft requires single-city scope and sufficient coverage', () => {
  assert.equal(
    shouldEnforceStrictInventoryDraft({
      scope: 'region_or_country',
      inventoryCount: 100,
      durationDays: 15,
    }),
    false
  );

  assert.equal(
    shouldEnforceStrictInventoryDraft({
      scope: 'single_city',
      inventoryCount: 2,
      durationDays: 15,
    }),
    false
  );

  assert.equal(
    shouldEnforceStrictInventoryDraft({
      scope: 'single_city',
      inventoryCount: 24,
      durationDays: 15,
    }),
    true
  );
});

