import assert from 'node:assert/strict';
import test from 'node:test';

import { createItem } from '@/types/itinerary';
import reducer, {
  addHostMarkers,
  addPlaceMarker,
  clearItinerary,
  clearVisualTarget,
  setActiveItemId,
  setFocusedItemId,
  setItineraryData,
  setTripId,
  setVisualTarget,
} from './globe-slice';
import { toolCallReceived } from './tool-calls-slice';

function makeDestination(id: string, day: number) {
  return {
    id,
    name: `Day ${day}`,
    lat: 10 + day,
    lng: 20 + day,
    day,
    activities: [createItem('SIGHT', `Stop ${day}`, 0)],
    color: '#023047',
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
  const cleared = reducer(withPlace, clearItinerary());

  assert.deepEqual(cleared.destinations, []);
  assert.deepEqual(cleared.routes, []);
  assert.deepEqual(cleared.routeMarkers, []);
  assert.equal(cleared.selectedDestination, null);
  assert.equal(cleared.visualTarget, null);
  assert.deepEqual(cleared.hostMarkers, []);
  assert.deepEqual(cleared.placeMarkers, []);
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
