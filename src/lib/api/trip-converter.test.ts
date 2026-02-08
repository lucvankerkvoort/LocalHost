import assert from 'node:assert/strict';
import test from 'node:test';

import { createItem } from '@/types/itinerary';
import {
  convertGlobeDestinationsToApiPayload,
  convertTripToGlobeDestinations,
  type ApiTrip,
} from './trip-converter';

type GlobePayloadDestination = Parameters<typeof convertGlobeDestinationsToApiPayload>[0][number];

test('convertTripToGlobeDestinations sorts days and activity orderIndex', () => {
  const trip: ApiTrip = {
    id: 'trip-1',
    userId: 'user-1',
    title: 'Test trip',
    stops: [
      {
        id: 'stop-1',
        title: 'Rome',
        type: 'CITY',
        locations: [{ name: 'Rome', lat: 41.9, lng: 12.5 }],
        days: [
          {
            id: 'day-2',
            dayIndex: 2,
            title: 'Day 2',
            items: [
              {
                id: 'item-2b',
                type: 'MEAL',
                title: 'Lunch',
                description: null,
                experienceId: null,
                locationName: 'Restaurant',
                lat: 41.91,
                lng: 12.51,
                orderIndex: 2,
                experience: null,
              },
              {
                id: 'item-2a',
                type: 'SIGHT',
                title: 'Museum',
                description: null,
                experienceId: null,
                locationName: 'Museum',
                lat: 41.92,
                lng: 12.52,
                orderIndex: 1,
                experience: null,
              },
            ],
            suggestedHosts: [],
          },
          {
            id: 'day-1',
            dayIndex: 1,
            title: 'Day 1',
            items: [],
            suggestedHosts: [],
          },
        ],
      },
    ],
  };

  const destinations = convertTripToGlobeDestinations(trip);

  assert.deepEqual(destinations.map((d) => d.day), [1, 2]);
  assert.deepEqual(
    destinations[1].activities.map((a) => a.id),
    ['item-2a', 'item-2b']
  );
});

test('convertTripToGlobeDestinations resolves host id from experience fallback', () => {
  const trip: ApiTrip = {
    id: 'trip-1',
    userId: 'user-1',
    title: 'Test trip',
    stops: [
      {
        id: 'stop-1',
        title: 'Lisbon',
        type: 'CITY',
        locations: [{ name: 'Lisbon', lat: 38.72, lng: -9.13 }],
        days: [
          {
            id: 'day-1',
            dayIndex: 1,
            title: 'Day 1',
            items: [
              {
                id: 'item-1',
                type: 'EXPERIENCE',
                title: 'Tile workshop',
                description: null,
                experienceId: 'exp-1',
                hostId: null,
                locationName: 'Studio',
                lat: 38.73,
                lng: -9.12,
                orderIndex: 0,
                experience: { hostId: 'host-from-experience' },
              },
            ],
            suggestedHosts: [],
          },
        ],
      },
    ],
  };

  const destinations = convertTripToGlobeDestinations(trip);

  assert.equal(destinations[0].activities[0].hostId, 'host-from-experience');
});

test('convertTripToGlobeDestinations preserves itinerary item status', () => {
  const trip: ApiTrip = {
    id: 'trip-status',
    userId: 'user-1',
    title: 'Status trip',
    stops: [
      {
        id: 'stop-1',
        title: 'Rome',
        type: 'CITY',
        locations: [{ name: 'Rome', lat: 41.9, lng: 12.5 }],
        days: [
          {
            id: 'day-1',
            dayIndex: 1,
            title: 'Day 1',
            items: [
              {
                id: 'item-booked',
                type: 'EXPERIENCE',
                title: 'Booked class',
                description: null,
                status: 'BOOKED',
                experienceId: 'exp-booked',
                hostId: 'host-1',
                locationName: 'Studio',
                lat: 41.91,
                lng: 12.51,
                orderIndex: 0,
                experience: null,
              },
            ],
            suggestedHosts: [],
          },
        ],
      },
    ],
  };

  const destinations = convertTripToGlobeDestinations(trip);
  assert.equal(destinations[0].activities[0].status, 'BOOKED');
});

test('convertTripToGlobeDestinations derives BOOKED status from confirmed bookings', () => {
  const trip: ApiTrip = {
    id: 'trip-booked-by-booking',
    userId: 'user-1',
    title: 'Booking status trip',
    stops: [
      {
        id: 'stop-1',
        title: 'Rome',
        type: 'CITY',
        locations: [{ name: 'Rome', lat: 41.9, lng: 12.5 }],
        days: [
          {
            id: 'day-1',
            dayIndex: 1,
            title: 'Day 1',
            items: [
              {
                id: 'item-booked',
                type: 'EXPERIENCE',
                title: 'Booked class',
                description: null,
                status: 'DRAFT',
                experienceId: 'exp-booked',
                hostId: 'host-1',
                locationName: 'Studio',
                lat: 41.91,
                lng: 12.51,
                orderIndex: 0,
                experience: null,
                bookings: [
                  {
                    id: 'booking-1',
                    status: 'CONFIRMED',
                    paymentStatus: 'PAID',
                    updatedAt: '2026-02-03T10:00:00.000Z',
                  },
                ],
              },
            ],
            suggestedHosts: [],
          },
        ],
      },
    ],
  };

  const destinations = convertTripToGlobeDestinations(trip);
  assert.equal(destinations[0].activities[0].status, 'BOOKED');
});

test('convertTripToGlobeDestinations derives PENDING status and candidateId from active tentative booking', () => {
  const trip: ApiTrip = {
    id: 'trip-pending',
    userId: 'user-1',
    title: 'Pending status trip',
    stops: [
      {
        id: 'stop-1',
        title: 'Rome',
        type: 'CITY',
        locations: [{ name: 'Rome', lat: 41.9, lng: 12.5 }],
        days: [
          {
            id: 'day-1',
            dayIndex: 1,
            title: 'Day 1',
            items: [
              {
                id: 'item-pending',
                type: 'EXPERIENCE',
                title: 'Tentative class',
                description: null,
                experienceId: 'exp-pending',
                hostId: 'host-1',
                locationName: 'Studio',
                lat: 41.91,
                lng: 12.51,
                orderIndex: 0,
                experience: null,
                bookings: [
                  {
                    id: 'booking-tentative',
                    status: 'TENTATIVE',
                    paymentStatus: 'PENDING',
                    updatedAt: '2026-02-03T10:00:00.000Z',
                  },
                ],
              },
            ],
            suggestedHosts: [],
          },
        ],
      },
    ],
  };

  const destinations = convertTripToGlobeDestinations(trip);
  assert.equal(destinations[0].activities[0].status, 'PENDING');
  assert.equal(destinations[0].activities[0].candidateId, 'booking-tentative');
});

test('convertTripToGlobeDestinations derives FAILED status from latest failed booking when no active candidate exists', () => {
  const trip: ApiTrip = {
    id: 'trip-failed',
    userId: 'user-1',
    title: 'Failed status trip',
    stops: [
      {
        id: 'stop-1',
        title: 'Rome',
        type: 'CITY',
        locations: [{ name: 'Rome', lat: 41.9, lng: 12.5 }],
        days: [
          {
            id: 'day-1',
            dayIndex: 1,
            title: 'Day 1',
            items: [
              {
                id: 'item-failed',
                type: 'EXPERIENCE',
                title: 'Failed class',
                description: null,
                experienceId: 'exp-failed',
                hostId: 'host-1',
                locationName: 'Studio',
                lat: 41.91,
                lng: 12.51,
                orderIndex: 0,
                experience: null,
                bookings: [
                  {
                    id: 'booking-failed',
                    status: 'TENTATIVE',
                    paymentStatus: 'FAILED',
                    updatedAt: '2026-02-03T10:00:00.000Z',
                  },
                ],
              },
            ],
            suggestedHosts: [],
          },
        ],
      },
    ],
  };

  const destinations = convertTripToGlobeDestinations(trip);
  assert.equal(destinations[0].activities[0].status, 'FAILED');
  assert.equal(destinations[0].activities[0].candidateId, undefined);
});

test('convertTripToGlobeDestinations falls back to stop city and coordinates when item fields are null', () => {
  const trip: ApiTrip = {
    id: 'trip-1',
    userId: 'user-1',
    title: 'Test trip',
    stops: [
      {
        id: 'stop-1',
        title: 'Kyoto',
        type: 'CITY',
        locations: [{ name: 'Kyoto', lat: 35.0116, lng: 135.7681 }],
        days: [
          {
            id: 'day-1',
            dayIndex: 1,
            title: null,
            items: [
              {
                id: 'item-1',
                type: 'SIGHT',
                title: 'Unknown location stop',
                description: null,
                experienceId: null,
                hostId: null,
                locationName: null,
                lat: null,
                lng: null,
                orderIndex: 0,
                experience: null,
              },
            ],
            suggestedHosts: [],
          },
        ],
      },
    ],
  };

  const destinations = convertTripToGlobeDestinations(trip);
  const itemPlace = destinations[0].activities[0].place;

  assert.equal(destinations[0].name, 'Kyoto');
  assert.equal(itemPlace?.name, 'Kyoto');
  assert.equal(itemPlace?.location.lat, 35.0116);
  assert.equal(itemPlace?.location.lng, 135.7681);
});

test('convertGlobeDestinationsToApiPayload sorts by day and groups stops by city transitions', () => {
  const destinations = [
    {
      id: 'day-2',
      name: 'Rome Day 2',
      city: 'Rome',
      lat: 41.9,
      lng: 12.5,
      day: 2,
      activities: [createItem('SIGHT', 'Stop 2', 10)],
      color: '#000',
    },
    {
      id: 'day-1',
      name: 'Rome Day 1',
      city: 'Rome',
      lat: 41.9,
      lng: 12.5,
      day: 1,
      activities: [createItem('SIGHT', 'Stop 1', 7)],
      color: '#000',
    },
    {
      id: 'day-3',
      name: 'Paris Day 3',
      city: 'Paris',
      lat: 48.8,
      lng: 2.3,
      day: 3,
      activities: [createItem('SIGHT', 'Stop 3', 3)],
      color: '#000',
    },
  ];

  const payload = convertGlobeDestinationsToApiPayload(
    destinations as unknown as GlobePayloadDestination[]
  );

  assert.equal(payload.stops.length, 2);
  assert.equal(payload.stops[0].title, 'Rome');
  assert.deepEqual(
    (payload.stops[0].days as Array<{ dayIndex: number }>).map((d) => d.dayIndex),
    [1, 2]
  );
  assert.equal(payload.stops[1].title, 'Paris');
  assert.deepEqual(
    (payload.stops[1].days as Array<{ dayIndex: number }>).map((d) => d.dayIndex),
    [3]
  );
});

test('convertGlobeDestinationsToApiPayload defaults missing item type to SIGHT and reindexes orderIndex', () => {
  const item = createItem('MEAL', 'Lunch', 99) as unknown as {
    type?: string;
    position?: number;
  };
  delete item.type;
  item.position = 42;

  const payload = convertGlobeDestinationsToApiPayload([
    {
      id: 'day-1',
      name: 'Day 1',
      city: 'Tokyo',
      lat: 35.6762,
      lng: 139.6503,
      day: 1,
      activities: [item as unknown as ReturnType<typeof createItem>],
      color: '#000',
    } as unknown as GlobePayloadDestination,
  ]);

  const apiItem = payload.stops[0].days[0].items[0];
  assert.equal(apiItem.type, 'SIGHT');
  assert.equal(apiItem.orderIndex, 0);
});

test('convertTripToGlobeDestinations returns empty array when trip has no stops', () => {
  const trip: ApiTrip = {
    id: 'trip-empty',
    userId: 'user-1',
    title: 'Empty trip',
    stops: [],
  };

  const destinations = convertTripToGlobeDestinations(trip);
  assert.deepEqual(destinations, []);
});

test('convertTripToGlobeDestinations assigns day color based on day index', () => {
  const trip: ApiTrip = {
    id: 'trip-colors',
    userId: 'user-1',
    title: 'Color trip',
    stops: [
      {
        id: 'stop-1',
        title: 'Rome',
        type: 'CITY',
        locations: [{ name: 'Rome', lat: 41.9, lng: 12.5 }],
        days: [
          { id: 'day-1', dayIndex: 1, title: 'Day 1', items: [], suggestedHosts: [] },
          { id: 'day-2', dayIndex: 2, title: 'Day 2', items: [], suggestedHosts: [] },
        ],
      },
    ],
  };

  const destinations = convertTripToGlobeDestinations(trip);
  assert.notEqual(destinations[0].color, destinations[1].color);
});

test('convertGlobeDestinationsToApiPayload uses destination name when city is missing', () => {
  const payload = convertGlobeDestinationsToApiPayload([
    {
      id: 'day-1',
      name: 'Fallback City Name',
      city: undefined,
      lat: 10,
      lng: 20,
      day: 1,
      activities: [],
      color: '#000',
    } as unknown as GlobePayloadDestination,
  ]);

  assert.equal(payload.stops[0].title, 'Fallback City Name');
});

test('convertGlobeDestinationsToApiPayload preserves explicit item type', () => {
  const payload = convertGlobeDestinationsToApiPayload([
    {
      id: 'day-1',
      name: 'Day 1',
      city: 'Tokyo',
      lat: 35.6,
      lng: 139.6,
      day: 1,
      activities: [createItem('MEAL', 'Dinner', 0)],
      color: '#000',
    } as unknown as GlobePayloadDestination,
  ]);

  assert.equal(payload.stops[0].days[0].items[0].type, 'MEAL');
});
