import assert from 'node:assert/strict';
import test from 'node:test';

import { createItem } from '@/types/itinerary';
import type { GlobeDestination } from '@/types/globe';
import type { ItineraryPlan } from './types';
import {
  convertPlanToGlobeData,
  generateMarkersFromDestinations,
  getCenterPoint,
  mapTransportMode,
} from './plan-converter';

function makePlace(
  id: string,
  name: string,
  lat: number,
  lng: number,
  category?: 'landmark' | 'museum' | 'restaurant' | 'park' | 'other'
) {
  return {
    id,
    name,
    location: { lat, lng },
    category,
  };
}

test('convertPlanToGlobeData maps categories, assigns hosts, and extracts city from address', () => {
  const plan: ItineraryPlan = {
    id: 'plan-1',
    title: 'Kyoto Plan',
    request: 'Kyoto trip',
    summary: 'summary',
    days: [
      {
        dayNumber: 1,
        title: 'Day One',
        anchorLocation: {
          ...makePlace('anchor-1', 'Kyoto Center', 35.0116, 135.7681),
          address: '123 Main St, Kyoto, Japan',
        },
        activities: [
          { id: 'a-1', place: makePlace('p-1', 'Temple', 35.02, 135.77, 'landmark'), timeSlot: 'morning' },
          { id: 'a-2', place: makePlace('p-2', 'Sushi', 35.03, 135.78, 'restaurant'), timeSlot: 'afternoon' },
          { id: 'a-3', place: makePlace('p-3', 'Workshop', 35.04, 135.79, 'other'), timeSlot: 'evening' },
        ],
        suggestedHosts: [
          { id: 'h-1', name: 'Host 1', headline: '', photoUrl: '', rating: 4.8, reviewCount: 10, tags: [] },
          { id: 'h-2', name: 'Host 2', headline: '', photoUrl: '', rating: 4.9, reviewCount: 12, tags: [] },
        ],
      },
    ],
  };

  const { destinations } = convertPlanToGlobeData(plan);
  const activities = destinations[0].activities;

  assert.equal(destinations.length, 1);
  assert.equal(destinations[0].city, 'Kyoto');
  assert.equal(activities[0].type, 'SIGHT');
  assert.equal(activities[0].hostId, undefined);
  assert.equal(activities[1].type, 'MEAL');
  assert.equal(activities[1].hostId, 'h-2');
  assert.equal(activities[2].type, 'EXPERIENCE');
  assert.equal(activities[2].hostId, 'h-1');
});

test('convertPlanToGlobeData skips day without anchor location', () => {
  const plan: ItineraryPlan = {
    id: 'plan-1',
    title: 'Plan',
    request: 'request',
    summary: 'summary',
    days: [
      {
        dayNumber: 1,
        title: 'Missing anchor',
        activities: [],
        suggestedHosts: [],
      },
    ],
  };

  const { destinations, routes, routeMarkers } = convertPlanToGlobeData(plan);
  assert.equal(destinations.length, 0);
  assert.equal(routes.length, 0);
  assert.equal(routeMarkers.length, 0);
});

test('convertPlanToGlobeData creates intra-day and inter-day routes with expected modes', () => {
  const plan: ItineraryPlan = {
    id: 'plan-2',
    title: 'Plan',
    request: 'request',
    summary: 'summary',
    days: [
      {
        dayNumber: 1,
        title: 'Day 1',
        anchorLocation: makePlace('a1', 'Anchor 1', 40.7, -74.0),
        activities: [
          { id: 'x1', place: makePlace('p1', 'Start', 40.71, -74.01), timeSlot: 'morning' },
          { id: 'x2', place: makePlace('p2', 'End', 40.72, -74.02), timeSlot: 'afternoon' },
        ],
        navigationEvents: [
          {
            type: 'transit',
            durationMinutes: 20,
            distanceMeters: 1500,
            instructions: 'Take train',
            fromPlaceId: 'p1',
            toPlaceId: 'p2',
          },
        ],
        suggestedHosts: [],
      },
      {
        dayNumber: 2,
        title: 'Day 2',
        anchorLocation: makePlace('a2', 'Anchor 2', 34.05, -118.24),
        activities: [],
        suggestedHosts: [],
      },
    ],
  };

  const { routes } = convertPlanToGlobeData(plan);

  assert.equal(routes.length, 2);
  assert.equal(routes[0].mode, 'train');
  assert.equal(routes[0].dayNumber, 1);
  assert.equal(routes[1].mode, 'flight');
});

test('convertPlanToGlobeData filters invalid (0,0) activity marker coordinates', () => {
  const plan: ItineraryPlan = {
    id: 'plan-3',
    title: 'Plan',
    request: 'request',
    summary: 'summary',
    days: [
      {
        dayNumber: 1,
        title: 'Day 1',
        anchorLocation: makePlace('a1', 'Anchor', 35.0, 139.0),
        activities: [
          { id: 'x1', place: makePlace('p1', 'Invalid', 0, 0), timeSlot: 'morning' },
          { id: 'x2', place: makePlace('p2', 'Valid', 35.1, 139.1), timeSlot: 'afternoon' },
        ],
        suggestedHosts: [],
      },
    ],
  };

  const { routeMarkers } = convertPlanToGlobeData(plan);

  assert.equal(
    routeMarkers.some((marker) => marker.name === 'Invalid'),
    false
  );
  assert.equal(
    routeMarkers.some((marker) => marker.name === 'Valid'),
    true
  );
});

test('mapTransportMode maps walk/transit/drive to globe modes', () => {
  assert.equal(mapTransportMode('walk'), 'walk');
  assert.equal(mapTransportMode('transit'), 'train');
  assert.equal(mapTransportMode('drive'), 'drive');
});

test('generateMarkersFromDestinations deduplicates hosts and ignores invalid coordinates', () => {
  const destinations: GlobeDestination[] = [
    {
      id: 'd1',
      name: 'Day 1',
      lat: 10,
      lng: 10,
      day: 1,
      color: '#000',
      suggestedHosts: [
        { id: 'h-1', name: 'Host 1' },
        { id: 'h-2', name: 'Host 2' },
      ],
      activities: [
        createItem('SIGHT', 'Valid', 0, {
          place: { id: 'p1', name: 'Valid', location: { lat: 11, lng: 11 } },
        }),
        createItem('SIGHT', 'Invalid', 1, {
          place: { id: 'p2', name: 'Invalid', location: { lat: 0, lng: 0 } },
        }),
      ],
    },
    {
      id: 'd2',
      name: 'Day 2',
      lat: 20,
      lng: 20,
      day: 2,
      color: '#000',
      suggestedHosts: [
        { id: 'h-2', name: 'Host 2' },
      ],
      activities: [],
    },
  ];

  const { hostMarkers, routeMarkers } = generateMarkersFromDestinations(destinations);

  assert.equal(hostMarkers.length, 2);
  assert.equal(routeMarkers.length, 1);
  assert.equal(routeMarkers[0].name, 'Valid');
});

test('getCenterPoint returns average center and null for empty destinations', () => {
  assert.equal(getCenterPoint([]), null);

  const center = getCenterPoint([
    { lat: 10, lng: 20 },
    { lat: 30, lng: 40 },
  ] as unknown as GlobeDestination[]);

  assert.deepEqual(center, { lat: 20, lng: 30 });
});

test('convertPlanToGlobeData prefers explicit anchor city when present', () => {
  const plan: ItineraryPlan = {
    id: 'plan-city',
    title: 'Plan',
    request: 'request',
    summary: 'summary',
    days: [
      {
        dayNumber: 1,
        title: 'Day 1',
        anchorLocation: {
          ...makePlace('a1', 'Anchor', 10, 20),
          city: 'Explicit City',
          description: 'Ignored, Description',
        },
        activities: [],
        suggestedHosts: [],
      },
    ],
  };

  const { destinations } = convertPlanToGlobeData(plan);
  assert.equal(destinations[0].city, 'Explicit City');
});

test('convertPlanToGlobeData creates no inter-day route when next day lacks anchor', () => {
  const plan: ItineraryPlan = {
    id: 'plan-missing-next-anchor',
    title: 'Plan',
    request: 'request',
    summary: 'summary',
    days: [
      {
        dayNumber: 1,
        title: 'Day 1',
        anchorLocation: makePlace('a1', 'Anchor 1', 10, 20),
        activities: [],
        suggestedHosts: [],
      },
      {
        dayNumber: 2,
        title: 'Day 2',
        activities: [],
        suggestedHosts: [],
      },
    ],
  };

  const { routes } = convertPlanToGlobeData(plan);
  assert.equal(routes.length, 0);
});

test('convertPlanToGlobeData maps drive navigation events to drive routes', () => {
  const plan: ItineraryPlan = {
    id: 'plan-drive',
    title: 'Plan',
    request: 'request',
    summary: 'summary',
    days: [
      {
        dayNumber: 1,
        title: 'Day 1',
        anchorLocation: makePlace('a1', 'Anchor', 10, 20),
        activities: [
          { id: 'a1', place: makePlace('p1', 'From', 10.1, 20.1), timeSlot: 'morning' },
          { id: 'a2', place: makePlace('p2', 'To', 10.2, 20.2), timeSlot: 'afternoon' },
        ],
        navigationEvents: [
          {
            type: 'drive',
            durationMinutes: 15,
            distanceMeters: 5000,
            instructions: 'Drive',
            fromPlaceId: 'p1',
            toPlaceId: 'p2',
          },
        ],
        suggestedHosts: [],
      },
    ],
  };

  const { routes } = convertPlanToGlobeData(plan);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].mode, 'drive');
});

test('mapTransportMode falls back to walk for unknown input', () => {
  assert.equal(mapTransportMode('hovercraft' as unknown as 'walk'), 'walk');
});

test('getCenterPoint returns the same coordinate for a single destination', () => {
  const center = getCenterPoint([{ lat: 12.34, lng: 56.78 }] as unknown as GlobeDestination[]);
  assert.deepEqual(center, { lat: 12.34, lng: 56.78 });
});
