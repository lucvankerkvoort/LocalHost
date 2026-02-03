import assert from 'node:assert/strict';
import test from 'node:test';

import type { HostCreationStop } from '@/store/host-creation-slice';
import {
  applyStopAppend,
  applyStopRemovalByName,
  applyStopReorderByNames,
  applyStopUpdateByName,
  normalizeStopName,
  resolveStopByName,
} from './stop-operations';

function makeStop(id: string, name: string, order: number): HostCreationStop {
  return {
    id,
    name,
    lat: 52 + order,
    lng: 4 + order,
    order,
  };
}

const sampleStops = [
  makeStop('1', 'Canal Cruise', 1),
  makeStop('2', 'De Zotte', 2),
  makeStop('3', 'Loetje', 3),
  makeStop('4', 'Aan de Waterkant', 4),
  makeStop('5', 'Melkweg', 5),
  makeStop('6', 'Paradiso', 6),
];

test('normalizeStopName normalizes casing, spacing, and edge punctuation', () => {
  assert.equal(normalizeStopName('  "De   ZOTTE!!!" '), 'de zotte');
});

test('resolveStopByName returns unique match when available', () => {
  const resolved = resolveStopByName(sampleStops, 'de zotte');
  assert.deepEqual(resolved, { ok: true, stopId: '2' });
});

test('resolveStopByName returns ambiguous when duplicates exist', () => {
  const duplicated = [...sampleStops, makeStop('7', 'Loetje', 7)];
  const resolved = resolveStopByName(duplicated, 'loetje');
  assert.deepEqual(resolved, {
    ok: false,
    reason: 'AMBIGUOUS',
    targetName: 'loetje',
  });
});

test('applyStopUpdateByName updates target stop fields', () => {
  const result = applyStopUpdateByName(sampleStops, {
    targetName: 'De Zotte',
    newName: 'Cafe De Zotte',
    description: 'Craft beer stop',
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.stops[1].name, 'Cafe De Zotte');
  assert.equal(result.stops[1].description, 'Craft beer stop');
});

test('applyStopRemovalByName removes stop and resequences order', () => {
  const result = applyStopRemovalByName(sampleStops, 'Loetje');
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.stops.length, 5);
  assert.deepEqual(
    result.stops.map((stop) => stop.name),
    ['Canal Cruise', 'De Zotte', 'Aan de Waterkant', 'Melkweg', 'Paradiso']
  );
  assert.deepEqual(
    result.stops.map((stop) => stop.order),
    [1, 2, 3, 4, 5]
  );
});

test('applyStopReorderByNames fully reorders by named sequence', () => {
  const result = applyStopReorderByNames(sampleStops, [
    'Canal Cruise',
    'De zotte',
    'Loetje',
    'Aan de waterkant',
    'Melkweg',
    'Paradiso',
  ]);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(
    result.stops.map((stop) => stop.name),
    ['Canal Cruise', 'De Zotte', 'Loetje', 'Aan de Waterkant', 'Melkweg', 'Paradiso']
  );
});

test('applyStopReorderByNames supports subset reorder and keeps remaining relative order', () => {
  const result = applyStopReorderByNames(sampleStops, ['Melkweg', 'Canal Cruise']);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(
    result.stops.map((stop) => stop.name),
    ['Melkweg', 'Canal Cruise', 'De Zotte', 'Loetje', 'Aan de Waterkant', 'Paradiso']
  );
});

test('applyStopReorderByNames fails with unmatched names and does not mutate', () => {
  const result = applyStopReorderByNames(sampleStops, ['Unknown Place', 'Canal Cruise']);
  assert.equal(result.success, false);
  if (result.success) return;
  assert.deepEqual(result.unmatchedNames, ['Unknown Place']);
});

test('applyStopAppend appends with sequential order', () => {
  const nextStops = applyStopAppend(sampleStops.slice(0, 2), {
    name: 'Nieuwmarkt',
    lat: 52.3728,
    lng: 4.9003,
  });
  assert.equal(nextStops.length, 3);
  assert.equal(nextStops[2].name, 'Nieuwmarkt');
  assert.equal(nextStops[2].order, 3);
});
