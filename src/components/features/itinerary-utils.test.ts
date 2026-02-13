import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatItineraryDayDate,
  isHostedExperienceItem,
  resolveItineraryDayCaption,
  resolveItineraryDayHeadline,
} from './itinerary-utils';

import type { ItineraryItem } from '@/types/itinerary';

test('isHostedExperienceItem requires EXPERIENCE type with hostId and experienceId', () => {
  const hosted: ItineraryItem = {
    id: 'item-1',
    type: 'EXPERIENCE',
    title: 'Hosted tour',
    hostId: 'host-1',
    experienceId: 'exp-1',
    position: 1,
  };
  const notHosted: ItineraryItem = {
    id: 'item-2',
    type: 'EXPERIENCE',
    title: 'Unhosted',
    position: 2,
  };
  const missingExperienceId: ItineraryItem = {
    id: 'item-4',
    type: 'EXPERIENCE',
    title: 'Missing exp id',
    hostId: 'host-2',
    position: 4,
  };
  const otherType: ItineraryItem = {
    id: 'item-3',
    type: 'MEAL',
    title: 'Lunch',
    hostId: 'host-2',
    position: 3,
  };

  assert.equal(isHostedExperienceItem(hosted), true);
  assert.equal(isHostedExperienceItem(notHosted), false);
  assert.equal(isHostedExperienceItem(missingExperienceId), false);
  assert.equal(isHostedExperienceItem(otherType), false);
});

test('formatItineraryDayDate returns formatted date or null', () => {
  const expected = new Date('2026-02-11T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  assert.equal(formatItineraryDayDate('2026-02-11T12:00:00'), expected);
  assert.equal(formatItineraryDayDate('not-a-date'), null);
  assert.equal(formatItineraryDayDate(undefined), null);
});

test('resolveItineraryDayHeadline prioritizes date, then title, then day number', () => {
  const expected = new Date('2026-02-11T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  assert.equal(resolveItineraryDayHeadline('2026-02-11T12:00:00', 'Vienna highlights', 2), expected);
  assert.equal(resolveItineraryDayHeadline(undefined, ' Vienna\'s elegant sights ', 3), "Vienna's elegant sights");
  assert.equal(resolveItineraryDayHeadline('not-a-date', '  ', 4), 'Day 4');
});

test('resolveItineraryDayCaption switches to city when title is promoted', () => {
  assert.equal(resolveItineraryDayCaption(undefined, "Vienna's elegant sights", 'Vienna', 1), 'Vienna');
  assert.equal(resolveItineraryDayCaption('not-a-date', '  ', 'Amsterdam', 2), 'Amsterdam');
  assert.equal(resolveItineraryDayCaption(undefined, '  ', undefined, 3), 'Day 3');

  const expected = new Date('2026-02-11T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  assert.equal(resolveItineraryDayCaption('2026-02-11T12:00:00', "Vienna's elegant sights", 'Vienna', 4), "Vienna's elegant sights");
  assert.equal(resolveItineraryDayCaption('2026-02-11T12:00:00', '  ', 'Vienna', 5), 'Day 5');
});
