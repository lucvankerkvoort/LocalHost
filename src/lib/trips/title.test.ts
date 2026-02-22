import assert from 'node:assert/strict';
import test from 'node:test';

import { generateTripTitleFromPlan } from './title';
import type { ItineraryPlan } from '@/lib/ai/types';

function buildPlan(partial: Partial<ItineraryPlan>): ItineraryPlan {
  return {
    id: partial.id ?? 'plan-1',
    title: partial.title ?? 'Trip',
    request: partial.request ?? 'Plan a trip',
    summary: partial.summary ?? 'Summary',
    days: partial.days ?? [],
  };
}

test('generateTripTitleFromPlan builds title from duration + adjective + road trip intent', () => {
  const title = generateTripTitleFromPlan(
    buildPlan({
      request: '15 day european road trip',
      days: [],
    })
  );

  assert.equal(title, '15-Day European Road Trip');
});

test('generateTripTitleFromPlan uses plan geography when request scope is vague', () => {
  const title = generateTripTitleFromPlan(
    buildPlan({
      request: 'Plan us a trip',
      days: [
        {
          dayNumber: 1,
          title: 'Rome',
          city: 'Rome',
          country: 'Italy',
          activities: [],
          suggestedHosts: [],
        },
        {
          dayNumber: 2,
          title: 'Florence',
          city: 'Florence',
          country: 'Italy',
          activities: [],
          suggestedHosts: [],
        },
      ],
    })
  );

  assert.equal(title, '2-Day Italy Adventure');
});
