import assert from 'node:assert/strict';
import test from 'node:test';

import { cityToIataCode } from '../amadeus-hotels-client';

test('cityToIataCode returns IATA code for known cities', () => {
  assert.equal(cityToIataCode('Paris'), 'PAR');
  assert.equal(cityToIataCode('Tokyo'), 'TYO');
  assert.equal(cityToIataCode('New York'), 'NYC');
  assert.equal(cityToIataCode('Rome'), 'ROM');
  assert.equal(cityToIataCode('London'), 'LON');
});

test('cityToIataCode is case-insensitive', () => {
  assert.equal(cityToIataCode('PARIS'), 'PAR');
  assert.equal(cityToIataCode('paris'), 'PAR');
  assert.equal(cityToIataCode('PaRiS'), 'PAR');
});

test('cityToIataCode handles cities with spaces', () => {
  assert.equal(cityToIataCode('New York'), 'NYC');
  assert.equal(cityToIataCode('San Francisco'), 'SFO');
  assert.equal(cityToIataCode('Hong Kong'), 'HKG');
});

test('cityToIataCode returns null for unknown cities', () => {
  assert.equal(cityToIataCode('Smallville'), null);
  assert.equal(cityToIataCode(''), null);
});
