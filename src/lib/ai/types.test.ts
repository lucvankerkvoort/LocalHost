import assert from 'node:assert/strict';
import test from 'node:test';

import { GeoPointSchema, ItineraryPlanSchema, PlaceSchema } from './types';

test('GeoPointSchema accepts valid numeric coordinates', () => {
  const parsed = GeoPointSchema.safeParse({ lat: 35.6, lng: 139.6 });
  assert.equal(parsed.success, true);
});

test('GeoPointSchema rejects non-numeric coordinates', () => {
  const parsed = GeoPointSchema.safeParse({ lat: '35.6', lng: 139.6 });
  assert.equal(parsed.success, false);
});

test('PlaceSchema accepts minimal required shape', () => {
  const parsed = PlaceSchema.safeParse({
    id: 'place-1',
    name: 'Shibuya',
    location: { lat: 35.6595, lng: 139.7005 },
  });
  assert.equal(parsed.success, true);
});

test('PlaceSchema rejects unsupported category', () => {
  const parsed = PlaceSchema.safeParse({
    id: 'place-1',
    name: 'Shibuya',
    location: { lat: 35.6595, lng: 139.7005 },
    category: 'beach',
  });
  assert.equal(parsed.success, false);
});

test('ItineraryPlanSchema validates complete plan and rejects malformed data', () => {
  const valid = ItineraryPlanSchema.safeParse({
    id: 'plan-1',
    title: 'Tokyo Weekend',
    request: 'Plan a weekend in Tokyo',
    summary: 'Compact city itinerary',
    days: [
      {
        dayNumber: 1,
        title: 'Culture Day',
        anchorLocation: {
          id: 'anchor-1',
          name: 'Asakusa',
          location: { lat: 35.7148, lng: 139.7967 },
          category: 'landmark',
        },
        activities: [
          {
            id: 'act-1',
            place: {
              id: 'place-1',
              name: 'Senso-ji',
              location: { lat: 35.7148, lng: 139.7967 },
              category: 'landmark',
            },
            timeSlot: 'morning',
          },
        ],
        navigationEvents: [
          {
            type: 'walk',
            durationMinutes: 12,
            distanceMeters: 900,
            instructions: 'Walk to next stop',
            fromPlaceId: 'place-1',
            toPlaceId: 'place-2',
          },
        ],
        suggestedHosts: [
          {
            id: 'host-1',
            name: 'Aki',
            headline: 'Food guide',
            photoUrl: 'https://example.com/photo.jpg',
            rating: 4.9,
            reviewCount: 120,
            tags: ['food'],
          },
        ],
      },
    ],
  });
  assert.equal(valid.success, true);

  const invalid = ItineraryPlanSchema.safeParse({
    id: 'plan-2',
    title: 'Bad plan',
    request: 'test',
    summary: 'test',
    days: [
      {
        dayNumber: 1,
        title: 'Invalid day',
        activities: [
          {
            id: 'act-1',
            place: {
              id: 'place-1',
              name: 'Bad Place',
              location: { lat: 'not-a-number', lng: 1 },
            },
            timeSlot: 'morning',
          },
        ],
        suggestedHosts: [],
      },
    ],
  });
  assert.equal(invalid.success, false);
});

test('ItineraryPlanSchema rejects invalid navigation event type', () => {
  const parsed = ItineraryPlanSchema.safeParse({
    id: 'plan-3',
    title: 'Invalid navigation',
    request: 'test',
    summary: 'test',
    days: [
      {
        dayNumber: 1,
        title: 'Day 1',
        activities: [],
        navigationEvents: [
          {
            type: 'boat',
            durationMinutes: 10,
            distanceMeters: 500,
            instructions: 'Sail',
            fromPlaceId: 'a',
            toPlaceId: 'b',
          },
        ],
        suggestedHosts: [],
      },
    ],
  });

  assert.equal(parsed.success, false);
});
