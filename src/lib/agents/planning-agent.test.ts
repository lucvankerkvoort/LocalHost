import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlannerRequest, getPlannerQuestion } from './planning-agent';

test('buildPlannerRequest prefers road trip wording when driving between two cities', () => {
  const request = buildPlannerRequest({
    destinations: ['Los Angeles', 'Chicago'],
    destinationScope: 'multi_city',
    needsCities: false,
    mustSeeProvided: false,
    avoidProvided: false,
    foodPreferencesProvided: false,
    hasGenerated: true,
    hasFlown: true,
    transportPreference: 'drive',
    durationDays: 6,
  });

  assert.ok(request.includes('road trip from Los Angeles to Chicago'));
  assert.ok(request.includes('Include intermediate overnight cities'));
  assert.ok(request.includes('Do not use flights'));
});

test('buildPlannerRequest includes flight preference for multi-city trips', () => {
  const request = buildPlannerRequest({
    destinations: ['Amsterdam', 'Berlin', 'Rome'],
    destinationScope: 'multi_city',
    needsCities: false,
    mustSeeProvided: false,
    avoidProvided: false,
    foodPreferencesProvided: false,
    hasGenerated: true,
    hasFlown: true,
    transportPreference: 'flight',
  });

  assert.ok(request.includes('Prefer flights between cities'));
});

test('getPlannerQuestion returns destination prompt when empty', () => {
  const question = getPlannerQuestion(
    {
      destinations: [],
      destinationScope: 'unknown',
      needsCities: false,
      mustSeeProvided: false,
      avoidProvided: false,
      foodPreferencesProvided: false,
      hasGenerated: false,
      hasFlown: false,
    },
    ''
  );

  assert.equal(question?.key, 'destination');
});
