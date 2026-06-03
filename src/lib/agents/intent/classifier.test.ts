import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyIntent } from './classifier';
import type { TravelProfile } from '@/lib/travel-profile/types';

function msg(text: string) {
  return [{ role: 'user', content: text }];
}

function profile(overrides: Partial<TravelProfile> = {}): TravelProfile {
  return {
    id: 'p1',
    userId: 'u1',
    travelStyle: 'FLEXIBLE',
    pace: 'BALANCED',
    budget: 'MID',
    groupType: 'SOLO',
    transportPreference: null,
    interests: [],
    completedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Spatial pattern
// ---------------------------------------------------------------------------

describe('classifyIntent — spatialPattern', () => {
  it('detects BASE_EXPLORE from "staying in"', () => {
    const { spatialPattern } = classifyIntent(msg('I want to stay in Wari and explore the area'), null);
    assert.equal(spatialPattern, 'BASE_EXPLORE');
  });

  it('detects BASE_EXPLORE from "based in"', () => {
    const { spatialPattern } = classifyIntent(msg('based in Florence, discover surrounding towns'), null);
    assert.equal(spatialPattern, 'BASE_EXPLORE');
  });

  it('detects LINEAR_ROUTE from "road trip"', () => {
    const { spatialPattern } = classifyIntent(msg('plan a road trip from LA to San Francisco'), null);
    assert.equal(spatialPattern, 'LINEAR_ROUTE');
  });

  it('detects LINEAR_ROUTE from "drive from X to Y"', () => {
    const { spatialPattern } = classifyIntent(msg('I want to drive from Amsterdam to Paris'), null);
    assert.equal(spatialPattern, 'LINEAR_ROUTE');
  });

  it('does NOT detect LINEAR_ROUTE without explicit drive/road-trip keywords', () => {
    // "from X to Y" alone (no drive / road trip language) must not trigger LINEAR_ROUTE
    const { spatialPattern } = classifyIntent(msg('transition from tired to refreshed on this vacation'), null);
    assert.notEqual(spatialPattern, 'LINEAR_ROUTE');
  });

  it('detects MULTI_DESTINATION from "hopping between"', () => {
    const { spatialPattern } = classifyIntent(msg('I want to go city hopping between Paris, Berlin and Prague'), null);
    assert.equal(spatialPattern, 'MULTI_DESTINATION');
  });

  it('detects MULTI_DESTINATION from "multiple countries"', () => {
    const { spatialPattern } = classifyIntent(msg('visit multiple countries in Southeast Asia'), null);
    assert.equal(spatialPattern, 'MULTI_DESTINATION');
  });

  it('detects HUB_SPOKE from "day trips from" without base-in language', () => {
    // "base in" would match BASE_EXPLORE first; use a message with only day-trip language
    const { spatialPattern } = classifyIntent(msg('I want to do day trips from the city center'), null);
    assert.equal(spatialPattern, 'HUB_SPOKE');
  });

  it('falls back to profile ROAD_TRIP → LINEAR_ROUTE when no message signal', () => {
    const { spatialPattern } = classifyIntent(msg('plan something for next month'), profile({ travelStyle: 'ROAD_TRIP' }));
    assert.equal(spatialPattern, 'LINEAR_ROUTE');
  });

  it('falls back to profile REGION_EXPLORER → BASE_EXPLORE when no message signal', () => {
    const { spatialPattern } = classifyIntent(msg('plan something for next month'), profile({ travelStyle: 'REGION_EXPLORER' }));
    assert.equal(spatialPattern, 'BASE_EXPLORE');
  });

  it('returns UNKNOWN when message has no spatial signal and no profile', () => {
    const { spatialPattern } = classifyIntent(msg('I want to travel somewhere nice'), null);
    assert.equal(spatialPattern, 'UNKNOWN');
  });
});

// ---------------------------------------------------------------------------
// Activity focus
// ---------------------------------------------------------------------------

describe('classifyIntent — activityFocus', () => {
  it('detects NATURE from "hiking"', () => {
    const { activityFocus } = classifyIntent(msg('I love hiking and want trails'), null);
    assert.equal(activityFocus, 'NATURE');
  });

  it('detects CULTURE from "museum"', () => {
    const { activityFocus } = classifyIntent(msg('love visiting museums and architecture'), null);
    assert.equal(activityFocus, 'CULTURE');
  });

  it('detects CULTURE from "art" as standalone word', () => {
    const { activityFocus } = classifyIntent(msg('I enjoy art and history'), null);
    assert.equal(activityFocus, 'CULTURE');
  });

  it('does NOT detect CULTURE from "start" (no false positive on art substring)', () => {
    const result = classifyIntent(msg("let's start planning a beach holiday"), null);
    assert.notEqual(result.activityFocus, 'CULTURE');
  });

  it('detects FOOD from "culinary"', () => {
    const { activityFocus } = classifyIntent(msg('looking for a culinary tour'), null);
    assert.equal(activityFocus, 'FOOD');
  });

  it('detects ADVENTURE from "surfing"', () => {
    const { activityFocus } = classifyIntent(msg('I want to go surfing and diving'), null);
    assert.equal(activityFocus, 'ADVENTURE');
  });

  it('uses profile interest as prior when no message signal', () => {
    const { activityFocus } = classifyIntent(
      msg('plan a trip to Thailand'),
      profile({ interests: ['hiking', 'nature'] })
    );
    assert.equal(activityFocus, 'NATURE');
  });
});

// ---------------------------------------------------------------------------
// Mobility mode
// ---------------------------------------------------------------------------

describe('classifyIntent — mobilityMode', () => {
  it('detects RV from "rv"', () => {
    const { mobilityMode } = classifyIntent(msg('planning an rv trip across the US'), null);
    assert.equal(mobilityMode, 'RV');
  });

  it('detects OWN_CAR from "rental car"', () => {
    const { mobilityMode } = classifyIntent(msg('I will rent a car and drive'), null);
    assert.equal(mobilityMode, 'OWN_CAR');
  });

  it('detects FLIGHTS_ONLY from "flights"', () => {
    const { mobilityMode } = classifyIntent(msg('fly between the cities'), null);
    assert.equal(mobilityMode, 'FLIGHTS_ONLY');
  });

  it('detects NO_CAR from "no car"', () => {
    const { mobilityMode } = classifyIntent(msg('I have no car, going car-free'), null);
    assert.equal(mobilityMode, 'NO_CAR');
  });

  it('falls back to profile transportPreference=drive → OWN_CAR', () => {
    const { mobilityMode } = classifyIntent(
      msg('plan something for next week'),
      profile({ transportPreference: 'drive' })
    );
    assert.equal(mobilityMode, 'OWN_CAR');
  });
});

// ---------------------------------------------------------------------------
// unresolvedDimensions
// ---------------------------------------------------------------------------

describe('classifyIntent — unresolvedDimensions', () => {
  it('fully resolved intent has empty unresolvedDimensions', () => {
    const result = classifyIntent(
      msg('road trip from LA to SF, driving, hiking focus'),
      profile({ pace: 'RELAXED' })
    );
    assert.equal(result.unresolvedDimensions.length, 0);
  });

  it('vague message with no profile has all four dimensions unresolved', () => {
    const result = classifyIntent(msg('I want to travel somewhere'), null);
    assert.ok(result.unresolvedDimensions.includes('spatialPattern'));
    assert.ok(result.unresolvedDimensions.includes('mobilityMode'));
    assert.ok(result.unresolvedDimensions.includes('activityFocus'));
    assert.ok(result.unresolvedDimensions.includes('pace'));
  });

  it('profile pace resolves pace dimension', () => {
    const result = classifyIntent(msg('trip to Japan'), profile({ pace: 'PACKED' }));
    assert.ok(!result.unresolvedDimensions.includes('pace'));
    assert.equal(result.pace, 'packed');
  });
});
