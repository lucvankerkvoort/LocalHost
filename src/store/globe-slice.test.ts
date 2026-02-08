import assert from 'node:assert/strict';
import test from 'node:test';

import type { GlobeDestination } from '@/types/globe';
import { createItem } from '@/types/itinerary';
import reducer, {
  addLocalExperience,
  addHostMarkers,
  addPlaceMarker,
  clearItinerary,
  clearVisualTarget,
  hydrateGlobeState,
  setDestinations,
  setSelectedDestination,
  setSelectedHostId,
  clearSelectedHostId,
  setSelectedExperienceId,
  clearSelectedExperienceId,
  setActiveItemId,
  setFocusedItemId,
  setItineraryData,
  setTripId,
  setVisualTarget,
  updateDayIds,
} from './globe-slice';
import { toolCallReceived } from './tool-calls-slice';

function makeDestination(id: string, day: number): GlobeDestination {
  return {
    id,
    name: `Day ${day}`,
    lat: 10 + day,
    lng: 20 + day,
    day,
    activities: [createItem('SIGHT', `Stop ${day}`, 0)],
    color: '#023047',
    type: 'CITY',
    locations: [{ name: `Day ${day}`, lat: 10 + day, lng: 20 + day }],
  };
}

function getInitialState() {
  return reducer(undefined, { type: '@@INIT' });
}

test('setTripId sets the trip id', () => {
  const state = reducer(getInitialState(), setTripId('trip-123'));
  assert.equal(state.tripId, 'trip-123');
});

test('setVisualTarget sets target and clearVisualTarget resets it', () => {
  const withTarget = reducer(
    getInitialState(),
    setVisualTarget({ lat: 35.6762, lng: 139.6503, height: 2500 })
  );
  assert.deepEqual(withTarget.visualTarget, { lat: 35.6762, lng: 139.6503, height: 2500 });

  const cleared = reducer(withTarget, clearVisualTarget());
  assert.equal(cleared.visualTarget, null);
});

test('addHostMarkers appends new markers and skips duplicate ids', () => {
  const start = reducer(
    getInitialState(),
    addHostMarkers([
      { id: 'h-1', name: 'Host 1', lat: 1, lng: 1 },
      { id: 'h-2', name: 'Host 2', lat: 2, lng: 2 },
    ])
  );

  const next = reducer(
    start,
    addHostMarkers([
      { id: 'h-2', name: 'Host 2 duplicate', lat: 20, lng: 20 },
      { id: 'h-3', name: 'Host 3', lat: 3, lng: 3 },
    ])
  );

  assert.equal(next.hostMarkers.length, 3);
  assert.deepEqual(
    next.hostMarkers.map((host) => host.id),
    ['h-1', 'h-2', 'h-3']
  );
});

test('addPlaceMarker replaces marker with same id', () => {
  const start = reducer(
    getInitialState(),
    addPlaceMarker({ id: 'p-1', name: 'Old', lat: 1, lng: 1, confidence: 1 })
  );

  const next = reducer(
    start,
    addPlaceMarker({ id: 'p-1', name: 'New', lat: 2, lng: 2, confidence: 0.8 })
  );

  assert.equal(next.placeMarkers.length, 1);
  assert.deepEqual(next.placeMarkers[0], {
    id: 'p-1',
    name: 'New',
    lat: 2,
    lng: 2,
    confidence: 0.8,
  });
});

test('clearItinerary clears destinations, routes, markers and selected destination', () => {
  const withData = reducer(
    getInitialState(),
    setItineraryData({
      destinations: [makeDestination('d-1', 1)],
      routes: [
        {
          id: 'r-1',
          fromId: 'd-1',
          toId: 'd-2',
          fromLat: 11,
          fromLng: 21,
          toLat: 12,
          toLng: 22,
          mode: 'train',
        },
      ],
      routeMarkers: [{ id: 'm-1', routeId: 'r-1', kind: 'start', lat: 11, lng: 21 }],
      selectedDestinationId: 'd-1',
    })
  );
  const withHost = reducer(
    withData,
    addHostMarkers([{ id: 'h-1', name: 'Host 1', lat: 1, lng: 1 }])
  );
  const withPlace = reducer(
    withHost,
    addPlaceMarker({ id: 'p-1', name: 'Place 1', lat: 1, lng: 1, confidence: 1 })
  );
  const withSelections = reducer(
    reducer(
      reducer(withPlace, setSelectedHostId('host-1')),
      setSelectedExperienceId('exp-1')
    ),
    setActiveItemId('item-1')
  );
  const cleared = reducer(withSelections, clearItinerary());

  assert.deepEqual(cleared.destinations, []);
  assert.deepEqual(cleared.routes, []);
  assert.deepEqual(cleared.routeMarkers, []);
  assert.equal(cleared.selectedDestination, null);
  assert.equal(cleared.visualTarget, null);
  assert.deepEqual(cleared.hostMarkers, []);
  assert.deepEqual(cleared.placeMarkers, []);
  assert.equal(cleared.selectedHostId, null);
  assert.equal(cleared.selectedExperienceId, null);
  assert.equal(cleared.activeItemId, null);
});

test('setSelectedHostId and clearSelectedHostId update selection', () => {
  const selected = reducer(getInitialState(), setSelectedHostId('host-9'));
  const cleared = reducer(selected, clearSelectedHostId());

  assert.equal(selected.selectedHostId, 'host-9');
  assert.equal(cleared.selectedHostId, null);
});

test('setSelectedExperienceId and clearSelectedExperienceId update selection', () => {
  const selected = reducer(getInitialState(), setSelectedExperienceId('exp-9'));
  const cleared = reducer(selected, clearSelectedExperienceId());

  assert.equal(selected.selectedExperienceId, 'exp-9');
  assert.equal(cleared.selectedExperienceId, null);
});

test('setActiveItemId also sets focusedItemId to active id', () => {
  const state = reducer(getInitialState(), setActiveItemId('item-42'));

  assert.equal(state.activeItemId, 'item-42');
  assert.equal(state.focusedItemId, 'item-42');
});

test('setFocusedItemId can independently change focus', () => {
  const active = reducer(getInitialState(), setActiveItemId('item-42'));
  const focused = reducer(active, setFocusedItemId('item-99'));

  assert.equal(focused.activeItemId, 'item-42');
  assert.equal(focused.focusedItemId, 'item-99');
});

test('toolCallReceived(flyToLocation) sets visualTarget and defaults height', () => {
  const state = reducer(
    getInitialState(),
    toolCallReceived({
      toolName: 'flyToLocation',
      state: 'result',
      result: { success: true, lat: 52.52, lng: 13.405 },
      source: 'chat',
    })
  );

  assert.deepEqual(state.visualTarget, {
    lat: 52.52,
    lng: 13.405,
    height: 500000,
  });
});

test('toolCallReceived(resolve_place) ignores low-confidence marker data', () => {
  const state = reducer(
    getInitialState(),
    toolCallReceived({
      toolName: 'resolve_place',
      state: 'result',
      result: {
        id: 'place-low',
        name: 'Too uncertain',
        confidence: 0.2,
        location: { lat: 40.0, lng: -74.0 },
      },
      source: 'chat',
    })
  );

  assert.equal(state.placeMarkers.length, 0);
});

test('setDestinations resets selected destination when prior selection is missing', () => {
  let state = reducer(getInitialState(), setSelectedDestination('missing'));
  state = reducer(state, setDestinations([makeDestination('d-1', 1), makeDestination('d-2', 2)]));

  assert.equal(state.selectedDestination, 'd-1');
});

test('setDestinations keeps selected destination when it still exists', () => {
  let state = reducer(getInitialState(), setSelectedDestination('d-2'));
  state = reducer(state, setDestinations([makeDestination('d-1', 1), makeDestination('d-2', 2)]));

  assert.equal(state.selectedDestination, 'd-2');
});

test('addPlaceMarker keeps only the most recent 50 markers', () => {
  let state = getInitialState();
  for (let i = 1; i <= 55; i++) {
    state = reducer(
      state,
      addPlaceMarker({
        id: `p-${i}`,
        name: `Place ${i}`,
        lat: i,
        lng: i,
        confidence: 1,
      })
    );
  }

  assert.equal(state.placeMarkers.length, 50);
  assert.equal(state.placeMarkers[0].id, 'p-6');
  assert.equal(state.placeMarkers[49].id, 'p-55');
});

test('hydrateGlobeState updates only provided fields and allows selectedDestination null', () => {
  let state = reducer(
    getInitialState(),
    setItineraryData({
      destinations: [makeDestination('d-1', 1)],
      routes: [],
      selectedDestinationId: 'd-1',
    })
  );
  state = reducer(
    state,
    hydrateGlobeState({
      selectedDestination: null,
      visualTarget: { lat: 1, lng: 2, height: 3 },
    })
  );

  assert.equal(state.destinations.length, 1);
  assert.equal(state.selectedDestination, null);
  assert.deepEqual(state.visualTarget, { lat: 1, lng: 2, height: 3 });
});

test('addLocalExperience appends item to matching day and marks it local', () => {
  let state = reducer(
    getInitialState(),
    setItineraryData({
      destinations: [makeDestination('d-1', 1)],
      routes: [],
      selectedDestinationId: 'd-1',
    })
  );
  state = reducer(
    state,
    addLocalExperience({
      dayNumber: 1,
      item: { title: 'New local stop', type: 'SIGHT' },
    })
  );

  assert.equal(state.destinations[0].activities.length, 2);
  const added = state.destinations[0].activities[1] as { isLocal?: boolean; id?: string };
  assert.equal(added.isLocal, true);
  assert.equal(typeof added.id, 'string');
});

test('addLocalExperience is a no-op when day does not exist', () => {
  let state = reducer(
    getInitialState(),
    setItineraryData({
      destinations: [makeDestination('d-1', 1)],
      routes: [],
      selectedDestinationId: 'd-1',
    })
  );
  state = reducer(
    state,
    addLocalExperience({
      dayNumber: 99,
      item: { title: 'Missing day stop', type: 'SIGHT' },
    })
  );

  assert.equal(state.destinations.length, 1);
  assert.equal(state.destinations[0].activities.length, 1);
});

test('updateDayIds remaps destination ids based on day number', () => {
  let state = reducer(
    getInitialState(),
    setItineraryData({
      destinations: [makeDestination('d-1', 1), makeDestination('d-2', 2)],
      routes: [],
      selectedDestinationId: 'd-1',
    })
  );
  state = reducer(state, updateDayIds({ 1: 'day-a', 2: 'day-b' }));

  assert.deepEqual(state.destinations.map((d) => d.id), ['day-a', 'day-b']);
});

test('toolCallReceived(resolve_place) adds valid marker data', () => {
  const state = reducer(
    getInitialState(),
    toolCallReceived({
      toolName: 'resolve_place',
      state: 'result',
      result: {
        id: 'place-ok',
        name: 'Valid Place',
        category: 'landmark',
        confidence: 0.9,
        location: { lat: 40.7128, lng: -74.006 },
      },
      source: 'chat',
    })
  );

  assert.equal(state.placeMarkers.length, 1);
  assert.equal(state.placeMarkers[0].id, 'place-ok');
});

test('toolCallReceived(resolve_place) ignores country category markers', () => {
  const state = reducer(
    getInitialState(),
    toolCallReceived({
      toolName: 'resolve_place',
      state: 'result',
      result: {
        id: 'country',
        name: 'France',
        category: 'country',
        confidence: 1,
        location: { lat: 46.2276, lng: 2.2137 },
      },
      source: 'chat',
    })
  );

  assert.equal(state.placeMarkers.length, 0);
});

test('toolCallReceived(resolve_place) ignores markers too far from anchor', () => {
  const state = reducer(
    getInitialState(),
    toolCallReceived({
      toolName: 'resolve_place',
      state: 'result',
      result: {
        id: 'too-far',
        name: 'Too Far',
        category: 'landmark',
        confidence: 0.95,
        distanceToAnchor: 500000,
        location: { lat: 10, lng: 10 },
      },
      source: 'chat',
    })
  );

  assert.equal(state.placeMarkers.length, 0);
});

test('hydrateGlobeState deduplicates routeMarkers based on id', () => {
  const state = reducer(
    getInitialState(),
    hydrateGlobeState({
      routeMarkers: [
        { id: 'rm-1', routeId: 'r-1', kind: 'start', lat: 10, lng: 10 },
        { id: 'rm-1', routeId: 'r-1', kind: 'start', lat: 20, lng: 20 },
        { id: 'rm-2', routeId: 'r-1', kind: 'end', lat: 30, lng: 30 },
      ] as any, // Cast as any because RouteMarkerData might have other optional fields, but id is key
    })
  );

  assert.equal(state.routeMarkers.length, 2);
  assert.equal(state.routeMarkers[0].id, 'rm-1');
  assert.equal(state.routeMarkers[1].id, 'rm-2');
});
