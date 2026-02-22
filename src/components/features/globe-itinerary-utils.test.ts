import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlannerExperienceStopMarkers } from './globe-itinerary-utils';

import type { PlannerExperienceHost } from '@/types/planner-experiences';

function buildHost(): PlannerExperienceHost {
  return {
    id: 'host-1',
    name: 'Host One',
    marker: {
      lat: 52.3676,
      lng: 4.9041,
    },
    languages: [],
    interests: [],
    experiences: [
      {
        id: 'exp-1',
        title: 'Canal Highlights',
        description: 'Walk canals',
        category: 'ARTS_CULTURE',
        duration: 180,
        price: 5000,
        rating: 4.8,
        reviewCount: 10,
        photos: [],
        city: 'Amsterdam',
        country: 'Netherlands',
        stops: [
          {
            id: 'stop-1',
            name: 'Prinsengracht',
            lat: 52.373,
            lng: 4.88,
            order: 0,
          },
          {
            id: 'stop-2',
            name: 'Invalid stop',
            lat: null,
            lng: 4.89,
            order: 1,
          },
        ],
      },
      {
        id: 'exp-2',
        title: 'Museum Route',
        description: 'Museums',
        category: 'ARTS_CULTURE',
        duration: 240,
        price: 6500,
        rating: 4.7,
        reviewCount: 8,
        photos: [],
        city: 'Amsterdam',
        country: 'Netherlands',
        stops: [
          {
            id: 'stop-3',
            name: 'Rijksmuseum',
            lat: 52.36,
            lng: 4.885,
            order: 0,
          },
        ],
      },
    ],
  };
}

test('returns no markers when host is not selected', () => {
  const markers = buildPlannerExperienceStopMarkers([buildHost()], null, null);
  assert.deepEqual(markers, []);
});

test('returns selected experience markers only', () => {
  const markers = buildPlannerExperienceStopMarkers([buildHost()], 'host-1', 'exp-1');
  assert.equal(markers.length, 1);
  assert.equal(markers[0].id, 'planner-stop-exp-1-stop-1');
  assert.equal(markers[0].name, 'Prinsengracht');
  assert.equal(markers[0].category, 'experience');
});

test('returns all selected host experience markers when no experience is selected', () => {
  const markers = buildPlannerExperienceStopMarkers([buildHost()], 'host-1', null);
  assert.equal(markers.length, 2);
  assert.deepEqual(
    markers.map((marker) => marker.id),
    ['planner-stop-exp-1-stop-1', 'planner-stop-exp-2-stop-3']
  );
  assert.equal(markers[0].name, 'Canal Highlights - Prinsengracht');
  assert.equal(markers[1].name, 'Museum Route - Rijksmuseum');
});
