import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  seedPlannerStateFromProfile,
  buildPlannerRequest,
  DEFAULT_PLANNER_STATE,
  type PlannerFlowState,
} from './planner-state';
import type { TravelProfile } from '@/lib/travel-profile/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function profile(overrides: Partial<TravelProfile>): TravelProfile {
  return {
    id: 'test-profile',
    userId: 'test-user',
    travelStyle: 'FLEXIBLE',
    pace: 'BALANCED',
    budget: 'MID',
    groupType: 'SOLO',
    transportPreference: null,
    interests: [],
    completedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// seedPlannerStateFromProfile
// ---------------------------------------------------------------------------

describe('seedPlannerStateFromProfile — null / incomplete profile', () => {
  it('returns state unchanged when profile is null', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, null);
    assert.deepEqual(result, DEFAULT_PLANNER_STATE);
  });

  it('returns state unchanged when profile has no completedAt', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, profile({ completedAt: null }));
    assert.deepEqual(result, DEFAULT_PLANNER_STATE);
  });

  it('returns state unchanged when profile is undefined', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, undefined);
    assert.deepEqual(result, DEFAULT_PLANNER_STATE);
  });
});

describe('seedPlannerStateFromProfile — Road Tripper persona', () => {
  const roadTripper = profile({ travelStyle: 'ROAD_TRIP', pace: 'RELAXED', budget: 'MID', groupType: 'SOLO' });

  it('sets transportPreference to drive', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, roadTripper);
    assert.equal(result.transportPreference, 'drive');
  });

  it('sets pace to relaxed', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, roadTripper);
    assert.equal(result.pace, 'relaxed');
  });

  it('sets budget to mid', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, roadTripper);
    assert.equal(result.budget, 'mid');
  });

  it('sets partyType to solo', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, roadTripper);
    assert.equal(result.partyType, 'solo');
  });
});

describe('seedPlannerStateFromProfile — Region Explorer persona (brother)', () => {
  const regionExplorer = profile({ travelStyle: 'REGION_EXPLORER', pace: 'RELAXED', budget: 'MID', groupType: 'SOLO' });

  it('sets pace to relaxed', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, regionExplorer);
    assert.equal(result.pace, 'relaxed');
  });

  it('does not set a transport preference (region explorers stay in one place)', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, regionExplorer);
    assert.equal(result.transportPreference, undefined);
  });

  it('sets budget to mid', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, regionExplorer);
    assert.equal(result.budget, 'mid');
  });
});

describe('seedPlannerStateFromProfile — Multi-Country Traveler persona (manager)', () => {
  const multiCountry = profile({ travelStyle: 'MULTI_COUNTRY', pace: 'BALANCED', budget: 'PREMIUM', groupType: 'SOLO' });

  it('sets transportPreference to flight', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, multiCountry);
    assert.equal(result.transportPreference, 'flight');
  });

  it('sets pace to balanced', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, multiCountry);
    assert.equal(result.pace, 'balanced');
  });

  it('sets budget to premium', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, multiCountry);
    assert.equal(result.budget, 'premium');
  });
});

describe('seedPlannerStateFromProfile — Backpacker persona', () => {
  const backpacker = profile({ travelStyle: 'BACKPACKER', pace: 'BALANCED', budget: 'BUDGET', groupType: 'SOLO' });

  it('sets budget to budget', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, backpacker);
    assert.equal(result.budget, 'budget');
  });

  it('does not override transport with a drive default', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, backpacker);
    assert.equal(result.transportPreference, undefined);
  });
});

describe('seedPlannerStateFromProfile — session values take precedence over profile', () => {
  it('existing transportPreference is not overridden by road-tripper profile', () => {
    const existingState: PlannerFlowState = { ...DEFAULT_PLANNER_STATE, transportPreference: 'flight' };
    const result = seedPlannerStateFromProfile(existingState, profile({ travelStyle: 'ROAD_TRIP' }));
    assert.equal(result.transportPreference, 'flight');
  });

  it('existing pace is not overridden by profile', () => {
    const existingState: PlannerFlowState = { ...DEFAULT_PLANNER_STATE, pace: 'packed' };
    const result = seedPlannerStateFromProfile(existingState, profile({ pace: 'RELAXED' }));
    assert.equal(result.pace, 'packed');
  });

  it('existing budget is not overridden by profile', () => {
    const existingState: PlannerFlowState = { ...DEFAULT_PLANNER_STATE, budget: 'budget' };
    const result = seedPlannerStateFromProfile(existingState, profile({ budget: 'PREMIUM' }));
    assert.equal(result.budget, 'budget');
  });

  it('existing partyType is not overridden by profile', () => {
    const existingState: PlannerFlowState = { ...DEFAULT_PLANNER_STATE, partyType: 'family' };
    const result = seedPlannerStateFromProfile(existingState, profile({ groupType: 'SOLO' }));
    assert.equal(result.partyType, 'family');
  });
});

describe('seedPlannerStateFromProfile — group type variants', () => {
  it('COUPLE sets partyType to couple', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, profile({ groupType: 'COUPLE' }));
    assert.equal(result.partyType, 'couple');
  });

  it('FAMILY sets partyType to family', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, profile({ groupType: 'FAMILY' }));
    assert.equal(result.partyType, 'family');
  });

  it('GROUP sets partyType to group', () => {
    const result = seedPlannerStateFromProfile(DEFAULT_PLANNER_STATE, profile({ groupType: 'GROUP' }));
    assert.equal(result.partyType, 'group');
  });
});

// ---------------------------------------------------------------------------
// buildPlannerRequest — verify persona-seeded state produces correct request strings
// ---------------------------------------------------------------------------

describe('buildPlannerRequest — Road Tripper request string', () => {
  it('includes drive constraint when transport is drive', () => {
    const state: PlannerFlowState = {
      ...DEFAULT_PLANNER_STATE,
      destinations: ['Los Angeles', 'San Francisco'],
      destinationScope: 'multi_city',
      transportPreference: 'drive',
      durationDays: 7,
    };
    const request = buildPlannerRequest(state);
    assert.ok(request.toLowerCase().includes('drive') || request.toLowerCase().includes('road trip'), `Expected drive reference, got: ${request}`);
  });

  it('contains no-flight instruction when driving', () => {
    const state: PlannerFlowState = {
      ...DEFAULT_PLANNER_STATE,
      destinations: ['Seattle', 'Portland'],
      destinationScope: 'multi_city',
      transportPreference: 'drive',
      durationDays: 5,
    };
    const request = buildPlannerRequest(state);
    assert.ok(request.includes('Do not use flights'), `Expected no-flights instruction, got: ${request}`);
  });
});

describe('buildPlannerRequest — Multi-Country request string', () => {
  it('includes flight preference when transport is flight', () => {
    const state: PlannerFlowState = {
      ...DEFAULT_PLANNER_STATE,
      destinations: ['Paris', 'Rome', 'Barcelona'],
      destinationScope: 'multi_city',
      transportPreference: 'flight',
      durationDays: 21,
    };
    const request = buildPlannerRequest(state);
    assert.ok(request.toLowerCase().includes('flight'), `Expected flight preference, got: ${request}`);
  });
});

describe('buildPlannerRequest — pace and budget in request', () => {
  it('includes relaxed pace for region explorer', () => {
    const state: PlannerFlowState = {
      ...DEFAULT_PLANNER_STATE,
      destinations: ['Tuscany'],
      destinationScope: 'region',
      pace: 'relaxed',
      durationDays: 7,
    };
    const request = buildPlannerRequest(state);
    assert.ok(request.includes('relaxed'), `Expected relaxed pace, got: ${request}`);
  });

  it('includes budget tier for backpacker', () => {
    const state: PlannerFlowState = {
      ...DEFAULT_PLANNER_STATE,
      destinations: ['Bangkok'],
      destinationScope: 'city',
      budget: 'budget',
      durationDays: 5,
    };
    const request = buildPlannerRequest(state);
    assert.ok(request.includes('budget'), `Expected budget tier, got: ${request}`);
  });
});
