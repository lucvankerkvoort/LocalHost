import assert from 'node:assert/strict';
import test from 'node:test';

import type { HostWithLocation } from './hosts-slice';
import reducer, {
  addHost,
  filterHostsByProximity,
  makeSelectHostsNearLocation,
  removeHost,
  selectAllHosts,
  selectHostsError,
  selectHostsLoading,
  setError,
  setHosts,
  setLoading,
} from './hosts-slice';

type HostsRootState = { hosts: ReturnType<typeof reducer> };

function makeHost(id: string, lat: number, lng: number): HostWithLocation {
  return {
    id,
    name: `Host ${id}`,
    photo: 'https://example.com/photo.jpg',
    city: 'Test City',
    country: 'Test Country',
    bio: 'Bio',
    quote: 'Quote',
    interests: ['food'],
    languages: ['English'],
    responseTime: 'within an hour',
    memberSince: '2024',
    experiences: [],
    lat,
    lng,
  };
}

function toRoot(hostsState: ReturnType<typeof reducer>): HostsRootState {
  return { hosts: hostsState };
}

test('setHosts replaces the entire hosts array', () => {
  const hosts = [makeHost('h-1', 0.1, 1), makeHost('h-2', 0.2, 1)];
  const state = reducer(undefined, setHosts(hosts));

  assert.deepEqual(state.allHosts.map((host) => host.id), ['h-1', 'h-2']);
});

test('addHost appends a new host', () => {
  const initial = reducer(undefined, setHosts([makeHost('h-1', 0.1, 1)]));
  const next = reducer(initial, addHost(makeHost('h-2', 0.2, 1)));

  assert.deepEqual(next.allHosts.map((host) => host.id), ['h-1', 'h-2']);
});

test('addHost skips duplicates by id', () => {
  const initial = reducer(undefined, setHosts([makeHost('h-1', 0.1, 1)]));
  const next = reducer(initial, addHost(makeHost('h-1', 0.2, 1.2)));

  assert.equal(next.allHosts.length, 1);
  assert.equal(next.allHosts[0].lat, 0.1);
  assert.equal(next.allHosts[0].lng, 1);
});

test('removeHost removes matching host id', () => {
  const initial = reducer(
    undefined,
    setHosts([makeHost('h-1', 0.1, 1), makeHost('h-2', 0.2, 1)])
  );
  const next = reducer(initial, removeHost('h-1'));

  assert.deepEqual(next.allHosts.map((host) => host.id), ['h-2']);
});

test('setLoading and setError update UI state flags', () => {
  const withLoading = reducer(undefined, setLoading(true));
  const withError = reducer(withLoading, setError('boom'));

  assert.equal(withError.loading, true);
  assert.equal(withError.error, 'boom');
});

test('base selectors return hosts/loading/error from state', () => {
  const state = toRoot(
    reducer(
      reducer(undefined, setHosts([makeHost('h-1', 0.1, 1)])),
      setError('oops')
    )
  );
  const loadingState = toRoot(reducer(state.hosts, setLoading(true)));

  assert.equal(selectAllHosts(state).length, 1);
  assert.equal(selectHostsError(state), 'oops');
  assert.equal(selectHostsLoading(loadingState), true);
});

test('makeSelectHostsNearLocation filters and sorts by distance', () => {
  const state = toRoot(
    reducer(
      undefined,
      setHosts([
        makeHost('near', 0, 1),
        makeHost('mid', 0, 1.5),
        makeHost('far', 10, 10),
      ])
    )
  );
  const selector = makeSelectHostsNearLocation();
  const result = selector(state, 0, 1, 100);

  assert.deepEqual(result.map((host) => host.id), ['near', 'mid']);
});

test('makeSelectHostsNearLocation returns [] when target is 0,0', () => {
  const state = toRoot(reducer(undefined, setHosts([makeHost('near', 0, 1)])));
  const selector = makeSelectHostsNearLocation();

  assert.deepEqual(selector(state, 0, 0, 100), []);
});

test('filterHostsByProximity returns [] when target is 0,0', () => {
  const hosts = [makeHost('h-1', 0.1, 1)];
  const result = filterHostsByProximity(hosts, 0, 0, 100);

  assert.deepEqual(result, []);
});

test('filterHostsByProximity filters by radius and sorts nearest first', () => {
  const hosts = [
    makeHost('near', 0, 1),
    makeHost('mid', 0, 1.5),
    makeHost('far', 10, 10),
  ];
  const result = filterHostsByProximity(hosts, 0, 1, 100);

  assert.deepEqual(result.map((host) => host.id), ['near', 'mid']);
});

test('makeSelectHostsNearLocation returns host at exact same coordinate first', () => {
  const state = toRoot(
    reducer(
      undefined,
      setHosts([
        makeHost('exact', 10, 10),
        makeHost('nearby', 10.01, 10.01),
      ])
    )
  );
  const selector = makeSelectHostsNearLocation();
  const result = selector(state, 10, 10, 10);

  assert.equal(result[0].id, 'exact');
});

test('filterHostsByProximity excludes hosts outside radius boundary', () => {
  const hosts = [makeHost('inside', 0, 1), makeHost('outside', 0, 3)];
  const result = filterHostsByProximity(hosts, 0, 1, 150);

  assert.deepEqual(result.map((host) => host.id), ['inside']);
});
