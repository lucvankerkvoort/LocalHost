import assert from 'node:assert/strict';
import test from 'node:test';

import reducer, {
  addStop,
  moveStop,
  removeStop,
  reorderStop,
  resetDraft,
  setCity,
  setDraft,
  updateDraft,
  updateStop,
} from './host-creation-slice';

function makeStop(id: string, order: number) {
  return {
    id,
    name: `Stop ${id}`,
    lat: 10 + order,
    lng: 20 + order,
    order,
  };
}

function getInitialState() {
  return reducer(undefined, { type: '@@INIT' });
}

test('setCity sets city name and coordinates', () => {
  const state = reducer(
    getInitialState(),
    setCity({ name: 'Lisbon', lat: 38.7223, lng: -9.1393 })
  );

  assert.equal(state.city, 'Lisbon');
  assert.equal(state.cityLat, 38.7223);
  assert.equal(state.cityLng, -9.1393);
});

test('addStop appends stop and removeStop deletes it by id', () => {
  const added = reducer(getInitialState(), addStop(makeStop('s-1', 1)));
  const removed = reducer(added, removeStop('s-1'));

  assert.equal(added.stops.length, 1);
  assert.equal(removed.stops.length, 0);
});

test('updateStop merges stop changes and preserves untouched fields', () => {
  const initial = reducer(getInitialState(), addStop(makeStop('s-1', 1)));
  const next = reducer(
    initial,
    updateStop({ id: 's-1', changes: { name: 'Updated', description: 'New desc' } })
  );

  assert.equal(next.stops[0].name, 'Updated');
  assert.equal(next.stops[0].description, 'New desc');
  assert.equal(next.stops[0].lat, 11);
  assert.equal(next.stops[0].order, 1);
});

test('reorderStop moves stop up and reassigns sequential order values', () => {
  const initial = reducer(
    reducer(
      reducer(getInitialState(), addStop(makeStop('s-1', 1))),
      addStop(makeStop('s-2', 2))
    ),
    addStop(makeStop('s-3', 3))
  );
  const next = reducer(initial, reorderStop({ id: 's-3', direction: 'up' }));

  assert.deepEqual(next.stops.map((stop) => stop.id), ['s-1', 's-3', 's-2']);
  assert.deepEqual(next.stops.map((stop) => stop.order), [1, 2, 3]);
});

test('reorderStop does nothing at boundary', () => {
  const initial = reducer(
    reducer(getInitialState(), addStop(makeStop('s-1', 1))),
    addStop(makeStop('s-2', 2))
  );
  const next = reducer(initial, reorderStop({ id: 's-1', direction: 'up' }));

  assert.deepEqual(next.stops.map((stop) => stop.id), ['s-1', 's-2']);
});

test('moveStop relocates active stop before over stop and reorders indices', () => {
  const initial = reducer(
    reducer(
      reducer(getInitialState(), addStop(makeStop('s-1', 1))),
      addStop(makeStop('s-2', 2))
    ),
    addStop(makeStop('s-3', 3))
  );
  const next = reducer(initial, moveStop({ activeId: 's-1', overId: 's-3' }));

  assert.deepEqual(next.stops.map((stop) => stop.id), ['s-2', 's-3', 's-1']);
  assert.deepEqual(next.stops.map((stop) => stop.order), [1, 2, 3]);
});

test('updateDraft merges only provided fields', () => {
  const state = reducer(
    getInitialState(),
    updateDraft({ title: 'Sunset tour', duration: 180, status: 'review' })
  );

  assert.equal(state.title, 'Sunset tour');
  assert.equal(state.duration, 180);
  assert.equal(state.status, 'review');
  assert.equal(state.city, null);
  assert.equal(state.isHydrated, false);
  assert.equal(state.draftId, null);
});

test('setDraft applies payload over a clean initial state', () => {
  const dirty = reducer(
    reducer(getInitialState(), setCity({ name: 'Rome', lat: 41.9, lng: 12.5 })),
    addStop(makeStop('s-1', 1))
  );
  const resetWithPayload = reducer(
    dirty,
    setDraft({ title: 'Fresh Draft', status: 'synthesizing', draftId: 'draft-123' })
  );

  assert.equal(resetWithPayload.title, 'Fresh Draft');
  assert.equal(resetWithPayload.status, 'synthesizing');
  assert.equal(resetWithPayload.draftId, 'draft-123');
  assert.equal(resetWithPayload.isHydrated, true);
  assert.equal(resetWithPayload.city, null);
  assert.deepEqual(resetWithPayload.stops, []);
});

test('resetDraft returns initial state', () => {
  const dirty = reducer(
    reducer(getInitialState(), setCity({ name: 'Rome', lat: 41.9, lng: 12.5 })),
    updateDraft({ title: 'Dirty', status: 'review' })
  );
  const reset = reducer(dirty, resetDraft());
  const initial = getInitialState();

  assert.deepEqual(reset, initial);
});

test('setDraft keeps provided stops and renumbers as provided', () => {
  const state = reducer(
    getInitialState(),
    setDraft({
      title: 'Draft with stops',
      stops: [makeStop('a', 3), makeStop('b', 7)],
    })
  );

  assert.equal(state.stops.length, 2);
  assert.equal(state.stops[0].id, 'a');
  assert.equal(state.stops[0].order, 3);
  assert.equal(state.stops[1].order, 7);
  assert.equal(state.isHydrated, true);
});

test('setDraft defaults draftId to null when payload omits it', () => {
  const state = reducer(getInitialState(), setDraft({ title: 'No id draft' }));

  assert.equal(state.draftId, null);
  assert.equal(state.isHydrated, true);
});
