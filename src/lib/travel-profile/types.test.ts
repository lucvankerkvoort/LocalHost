/**
 * Unit tests for travel-profile type constants.
 * Validates that all enum values have corresponding label/default entries.
 */
import { describe, it } from 'node:test';
import assert from 'assert/strict';

import {
  TRAVEL_STYLE_LABELS,
  TRAVEL_GROUP_LABELS,
  STYLE_TRANSPORT_DEFAULTS,
  type TravelStyle,
  type TravelGroup,
} from './types.js';

// All 8 TravelStyle values
const ALL_TRAVEL_STYLES: TravelStyle[] = [
  'ROAD_TRIP',
  'REGION_EXPLORER',
  'MULTI_COUNTRY',
  'BACKPACKER',
  'LUXURY',
  'CULTURAL',
  'ADVENTURE',
  'FLEXIBLE',
];

// All 4 TravelGroup values
const ALL_TRAVEL_GROUPS: TravelGroup[] = ['SOLO', 'COUPLE', 'FAMILY', 'GROUP'];

describe('TRAVEL_STYLE_LABELS', () => {
  it('has an entry for every TravelStyle value', () => {
    for (const style of ALL_TRAVEL_STYLES) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(TRAVEL_STYLE_LABELS, style),
        `TRAVEL_STYLE_LABELS is missing an entry for "${style}"`
      );
      assert.equal(
        typeof TRAVEL_STYLE_LABELS[style],
        'string',
        `TRAVEL_STYLE_LABELS["${style}"] should be a string`
      );
      assert.ok(
        TRAVEL_STYLE_LABELS[style].length > 0,
        `TRAVEL_STYLE_LABELS["${style}"] should not be empty`
      );
    }
  });

  it('covers exactly 8 travel styles', () => {
    assert.equal(
      Object.keys(TRAVEL_STYLE_LABELS).length,
      8,
      'TRAVEL_STYLE_LABELS should have exactly 8 entries'
    );
  });
});

describe('TRAVEL_GROUP_LABELS', () => {
  it('has an entry for every TravelGroup value', () => {
    for (const group of ALL_TRAVEL_GROUPS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(TRAVEL_GROUP_LABELS, group),
        `TRAVEL_GROUP_LABELS is missing an entry for "${group}"`
      );
      assert.equal(
        typeof TRAVEL_GROUP_LABELS[group],
        'string',
        `TRAVEL_GROUP_LABELS["${group}"] should be a string`
      );
      assert.ok(
        TRAVEL_GROUP_LABELS[group].length > 0,
        `TRAVEL_GROUP_LABELS["${group}"] should not be empty`
      );
    }
  });

  it('covers exactly 4 travel groups', () => {
    assert.equal(
      Object.keys(TRAVEL_GROUP_LABELS).length,
      4,
      'TRAVEL_GROUP_LABELS should have exactly 4 entries'
    );
  });
});

describe('STYLE_TRANSPORT_DEFAULTS', () => {
  it('maps ROAD_TRIP to "drive"', () => {
    assert.equal(
      STYLE_TRANSPORT_DEFAULTS['ROAD_TRIP'],
      'drive',
      'ROAD_TRIP default transport should be "drive"'
    );
  });

  it('maps MULTI_COUNTRY to "flight"', () => {
    assert.equal(
      STYLE_TRANSPORT_DEFAULTS['MULTI_COUNTRY'],
      'flight',
      'MULTI_COUNTRY default transport should be "flight"'
    );
  });

  it('does not contain entries for every style (it is a Partial record)', () => {
    // FLEXIBLE and CULTURAL have no defaults — that is expected
    assert.equal(
      STYLE_TRANSPORT_DEFAULTS['FLEXIBLE' as TravelStyle],
      undefined,
      'FLEXIBLE should have no default transport'
    );
  });
});
