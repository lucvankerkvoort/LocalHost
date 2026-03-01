import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GenerateItineraryInputSchema,
  resolveGenerateItineraryRequest,
} from './planner-generate';
import type { PlannerFlowState } from './planner-state';

const BASE_STATE: PlannerFlowState = {
  destinations: [],
  destinationScope: 'unknown',
  needsCities: false,
  mustSeeProvided: false,
  avoidProvided: false,
  foodPreferencesProvided: false,
  hasGenerated: false,
  hasFlown: false,
};

test('GenerateItineraryInputSchema accepts request-only payload', () => {
  const parsed = GenerateItineraryInputSchema.safeParse({
    request: 'Plan 5 days in Paris',
  });
  assert.equal(parsed.success, true);
});

test('GenerateItineraryInputSchema requires request or destinations', () => {
  const parsed = GenerateItineraryInputSchema.safeParse({});
  assert.equal(parsed.success, false);
});

test('resolveGenerateItineraryRequest preserves explicit request when no structured overrides', () => {
  const result = resolveGenerateItineraryRequest(
    {
      request: 'Plan 5 days in Paris for a foodie.',
    },
    BASE_STATE
  );

  assert.equal(result.request, 'Plan 5 days in Paris for a foodie.');
  assert.equal(result.usedStructuredInput, false);
});

test('resolveGenerateItineraryRequest builds canonical planner request from structured fields', () => {
  const result = resolveGenerateItineraryRequest(
    {
      destinations: ['Los Angeles', 'Zion National Park'],
      transportPreference: 'drive',
      durationDays: 7,
      mustSee: ['Yosemite National Park'],
    },
    BASE_STATE
  );

  assert.equal(result.usedStructuredInput, true);
  assert.ok(result.request.includes('Plan a road trip from Los Angeles to Zion National Park'));
  assert.ok(result.request.includes('Do not use flights'));
  assert.ok(result.request.includes('Must-see: Yosemite National Park'));
});

test('resolveGenerateItineraryRequest appends structured constraints to explicit request', () => {
  const result = resolveGenerateItineraryRequest(
    {
      request: 'Plan me a west coast road trip.',
      destinations: ['Los Angeles', 'Yosemite', 'Zion'],
      transportPreference: 'drive',
      budget: 'mid',
    },
    BASE_STATE
  );

  assert.equal(result.usedStructuredInput, true);
  assert.ok(result.request.includes('Plan me a west coast road trip.'));
  assert.ok(result.request.includes('Structured constraints:'));
  assert.ok(result.request.includes('Destinations (ordered): Los Angeles, Yosemite, Zion'));
  assert.ok(result.request.includes('Transport between cities: drive'));
});
