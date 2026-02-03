import assert from 'node:assert/strict';
import test from 'node:test';

import { createDaysFromRange, createItem, createItinerary } from './itinerary';

test('createDaysFromRange returns one day when start and end are equal', () => {
  const days = createDaysFromRange('2026-01-01', '2026-01-01');

  assert.equal(days.length, 1);
  assert.equal(days[0].dayNumber, 1);
  assert.equal(days[0].date, '2026-01-01');
  assert.deepEqual(days[0].items, []);
});

test('createDaysFromRange returns expected day count and sequential day numbers', () => {
  const days = createDaysFromRange('2026-01-01', '2026-01-03');

  assert.equal(days.length, 3);
  assert.deepEqual(
    days.map((day) => day.dayNumber),
    [1, 2, 3]
  );
  assert.deepEqual(
    days.map((day) => day.date),
    ['2026-01-01', '2026-01-02', '2026-01-03']
  );
});

test('createItinerary builds object with params, dates, and matching timestamps', () => {
  const itinerary = createItinerary(
    'Kyoto Escape',
    'Kyoto',
    '2026-02-10',
    '2026-02-12'
  );

  assert.equal(itinerary.title, 'Kyoto Escape');
  assert.equal(itinerary.destination, 'Kyoto');
  assert.equal(itinerary.startDate, '2026-02-10');
  assert.equal(itinerary.endDate, '2026-02-12');
  assert.equal(itinerary.days.length, 3);
  assert.equal(itinerary.createdAt, itinerary.updatedAt);
  assert.ok(Number.isFinite(Date.parse(itinerary.createdAt)));
});

test('createItem sets required fields with generated id', () => {
  const item = createItem('SIGHT', 'Temple Visit', 2);

  assert.equal(item.type, 'SIGHT');
  assert.equal(item.title, 'Temple Visit');
  assert.equal(item.position, 2);
  assert.ok(typeof item.id === 'string');
  assert.ok(item.id.length > 5);
});

test('createItem merges optional fields', () => {
  const item = createItem('MEAL', 'Lunch', 1, {
    description: 'Local ramen shop',
    duration: 90,
    category: 'FOOD_DRINK',
    hostId: 'host-1',
  });

  assert.equal(item.description, 'Local ramen shop');
  assert.equal(item.duration, 90);
  assert.equal(item.category, 'FOOD_DRINK');
  assert.equal(item.hostId, 'host-1');
});
