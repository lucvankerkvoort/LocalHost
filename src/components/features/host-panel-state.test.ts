import assert from 'node:assert/strict';
import test from 'node:test';

import type { ItineraryItem } from '@/types/itinerary';
import {
  buildAddedExperienceIds,
  buildBookedExperienceIds,
  getHostExperienceCtaState,
} from './host-panel-state';

function makeActivity(
  id: string,
  experienceId?: string,
  status?: ItineraryItem['status']
): ItineraryItem {
  return {
    id,
    type: 'EXPERIENCE',
    title: `Activity ${id}`,
    position: 0,
    experienceId,
    status,
  };
}

test('buildAddedExperienceIds includes all activities with experience IDs', () => {
  const activities: ItineraryItem[] = [
    makeActivity('a', 'exp-a', 'DRAFT'),
    makeActivity('b', 'exp-b', 'BOOKED'),
    makeActivity('c'),
  ];

  const result = buildAddedExperienceIds(activities);

  assert.equal(result.has('exp-a'), true);
  assert.equal(result.has('exp-b'), true);
  assert.equal(result.has('exp-c'), false);
  assert.equal(result.size, 2);
});

test('buildBookedExperienceIds only includes BOOKED activities with experience IDs', () => {
  const activities: ItineraryItem[] = [
    makeActivity('a', 'exp-a', 'DRAFT'),
    makeActivity('b', 'exp-b', 'BOOKED'),
    makeActivity('c', 'exp-c', 'PENDING'),
    makeActivity('d', undefined, 'BOOKED'),
  ];

  const result = buildBookedExperienceIds(activities);

  assert.equal(result.has('exp-a'), false);
  assert.equal(result.has('exp-b'), true);
  assert.equal(result.has('exp-c'), false);
  assert.equal(result.size, 1);
});

test('getHostExperienceCtaState prioritizes BOOKED over REMOVE', () => {
  assert.equal(getHostExperienceCtaState(true, true), 'BOOKED');
  assert.equal(getHostExperienceCtaState(false, true), 'BOOKED');
});

test('getHostExperienceCtaState returns REMOVE for added draft experiences', () => {
  assert.equal(getHostExperienceCtaState(true, false), 'REMOVE');
});

test('getHostExperienceCtaState returns ADD for not-yet-added experiences', () => {
  assert.equal(getHostExperienceCtaState(false, false), 'ADD');
});
