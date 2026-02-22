import assert from 'node:assert/strict';
import test from 'node:test';

import { detectRoadTripIntent, detectTransportPreference, extractFromToDestinations } from './planner-helpers';

test('extractFromToDestinations parses explicit from-to cities', () => {
  const result = extractFromToDestinations('Plan a trip from Los Angeles to San Francisco');
  assert.deepEqual(result, ['Los Angeles', 'San Francisco']);
});

test('extractFromToDestinations ignores date ranges', () => {
  const result = extractFromToDestinations('I am traveling from May 1 to May 5');
  assert.equal(result, null);
});

test('extractFromToDestinations ignores numeric ranges', () => {
  const result = extractFromToDestinations('Budget from $500 to $800');
  assert.equal(result, null);
});

test('detectRoadTripIntent detects road trip phrasing', () => {
  assert.equal(detectRoadTripIntent('Road trip from LA to Chicago'), true);
  assert.equal(detectRoadTripIntent('We are driving from Berlin to Prague'), true);
  assert.equal(detectRoadTripIntent('Route 66 road trip'), true);
  assert.equal(detectRoadTripIntent('Plan a trip from May to June'), false);
});

test('detectTransportPreference identifies explicit transport modes', () => {
  assert.equal(detectTransportPreference('Let us take the train'), 'train');
  assert.equal(detectTransportPreference('We should fly between cities'), 'flight');
  assert.equal(detectTransportPreference('Boat or ferry is fine'), 'boat');
  assert.equal(detectTransportPreference('Drive the whole way'), 'drive');
  assert.equal(detectTransportPreference('No preference'), null);
});
