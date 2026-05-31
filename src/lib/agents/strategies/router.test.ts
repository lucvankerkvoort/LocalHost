import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { routeToStrategy } from './router';
import type { TripIntent } from '../intent/types';

function intent(overrides: Partial<TripIntent> = {}): TripIntent {
  return {
    spatialPattern: 'UNKNOWN',
    activityFocus: 'UNKNOWN',
    mobilityMode: 'UNKNOWN',
    unresolvedDimensions: ['spatialPattern', 'mobilityMode', 'activityFocus', 'pace'],
    ...overrides,
  };
}

describe('routeToStrategy — spatial pattern wins', () => {
  it('BASE_EXPLORE → region-explorer', () => {
    const s = routeToStrategy(intent({ spatialPattern: 'BASE_EXPLORE' }));
    assert.equal(s.id, 'region-explorer');
  });

  it('HUB_SPOKE → region-explorer', () => {
    const s = routeToStrategy(intent({ spatialPattern: 'HUB_SPOKE' }));
    assert.equal(s.id, 'region-explorer');
  });

  it('LINEAR_ROUTE → road-trip', () => {
    const s = routeToStrategy(intent({ spatialPattern: 'LINEAR_ROUTE' }));
    assert.equal(s.id, 'road-trip');
  });

  it('MULTI_DESTINATION → multi-country', () => {
    const s = routeToStrategy(intent({ spatialPattern: 'MULTI_DESTINATION' }));
    assert.equal(s.id, 'multi-country');
  });

  it('MULTI_DESTINATION + OWN_CAR → multi-country (spatial beats mobility)', () => {
    // Driving a multi-city loop should NOT become a road-trip plan
    const s = routeToStrategy(intent({ spatialPattern: 'MULTI_DESTINATION', mobilityMode: 'OWN_CAR' }));
    assert.equal(s.id, 'multi-country');
  });

  it('LINEAR_ROUTE + FLIGHTS_ONLY → road-trip (spatial beats mobility)', () => {
    const s = routeToStrategy(intent({ spatialPattern: 'LINEAR_ROUTE', mobilityMode: 'FLIGHTS_ONLY' }));
    assert.equal(s.id, 'road-trip');
  });
});

describe('routeToStrategy — mobility fallback when spatial is UNKNOWN', () => {
  it('UNKNOWN + OWN_CAR → road-trip', () => {
    const s = routeToStrategy(intent({ mobilityMode: 'OWN_CAR' }));
    assert.equal(s.id, 'road-trip');
  });

  it('UNKNOWN + RV → road-trip', () => {
    const s = routeToStrategy(intent({ mobilityMode: 'RV' }));
    assert.equal(s.id, 'road-trip');
  });

  it('UNKNOWN + FLIGHTS_ONLY → multi-country', () => {
    const s = routeToStrategy(intent({ mobilityMode: 'FLIGHTS_ONLY' }));
    assert.equal(s.id, 'multi-country');
  });

  it('UNKNOWN + UNKNOWN → default', () => {
    const s = routeToStrategy(intent());
    assert.equal(s.id, 'default');
  });
});
