import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractExplicitLocationHint,
  resolveActivityAnchor,
  resolveActivityContext,
  resolveDayCity,
  resolveExplicitLocationContext,
} from './orchestrator-helpers';


test('resolveDayCity prefers anchor city and recalculates main-city flag', () => {
  const result = resolveDayCity({
    dayCity: 'Los Angeles',
    mainCity: 'Los Angeles',
    anchorCity: 'Springfield',
  });

  assert.equal(result.dayCity, 'Springfield');
  assert.equal(result.isMainCity, false);
});

test('resolveDayCity trims and matches main city case-insensitively', () => {
  const result = resolveDayCity({
    dayCity: '  AMSTERDAM ',
    mainCity: 'amsterdam',
  });

  assert.equal(result.dayCity, 'AMSTERDAM');
  assert.equal(result.isMainCity, true);
});

test('resolveActivityAnchor prefers day anchor and avoids trip anchor for non-main city', () => {
  const dayAnchor = { lat: 1, lng: 2 };
  const tripAnchor = { lat: 9, lng: 9 };

  assert.deepEqual(
    resolveActivityAnchor({ dayAnchor, tripAnchor, isMainCity: false }),
    dayAnchor
  );
  assert.deepEqual(
    resolveActivityAnchor({ dayAnchor: null, tripAnchor, isMainCity: true }),
    tripAnchor
  );
  assert.equal(
    resolveActivityAnchor({ dayAnchor: null, tripAnchor, isMainCity: false }),
    null
  );
});

test('resolveActivityContext formats city/country and trims whitespace', () => {
  assert.equal(
    resolveActivityContext({ dayCity: ' Springfield ', dayCountry: ' United States ' }),
    'Springfield, United States'
  );
  assert.equal(
    resolveActivityContext({ dayCity: 'Amsterdam', dayCountry: '' }),
    'Amsterdam'
  );
  assert.equal(
    resolveActivityContext({ dayCity: '   ', dayCountry: 'Netherlands' }),
    'Netherlands'
  );
});

test('extractExplicitLocationHint pulls location from parentheses and dash suffixes', () => {
  assert.deepEqual(
    extractExplicitLocationHint('Cozy Dog Drive In (Springfield, IL)'),
    { placeName: 'Cozy Dog Drive In', locationHint: 'Springfield, IL' }
  );
  assert.deepEqual(
    extractExplicitLocationHint('Route 66 - Flagstaff, AZ'),
    { placeName: 'Route 66', locationHint: 'Flagstaff, AZ' }
  );
  assert.deepEqual(
    extractExplicitLocationHint('Lyon, FR'),
    { placeName: 'Lyon', locationHint: 'Lyon, FR' }
  );
  assert.deepEqual(
    extractExplicitLocationHint('Oslo (NO)'),
    { placeName: 'Oslo', locationHint: 'Oslo, NO' }
  );
  assert.deepEqual(
    extractExplicitLocationHint('Pantheon in Rome'),
    { placeName: 'Pantheon', locationHint: 'Rome' }
  );
});

test('extractExplicitLocationHint treats fully qualified names as explicit locations', () => {
  assert.deepEqual(
    extractExplicitLocationHint('Flagstaff, AZ'),
    { placeName: 'Flagstaff', locationHint: 'Flagstaff, AZ' }
  );
  assert.deepEqual(
    extractExplicitLocationHint('Paris, France'),
    { placeName: 'Paris', locationHint: 'Paris, France' }
  );
  assert.deepEqual(
    extractExplicitLocationHint('Pantheon, Rome'),
    { placeName: 'Pantheon', locationHint: 'Rome' }
  );
});

test('resolveExplicitLocationContext avoids duplicating the country', () => {
  assert.equal(
    resolveExplicitLocationContext({ locationHint: 'Springfield, IL', dayCountry: 'United States' }),
    'Springfield, IL, United States'
  );
  assert.equal(
    resolveExplicitLocationContext({ locationHint: 'Paris, France', dayCountry: 'France' }),
    'Paris, France'
  );
  assert.equal(
    resolveExplicitLocationContext({ locationHint: 'Lyon, FR', dayCountry: 'France' }),
    'Lyon, FR'
  );
  assert.equal(
    resolveExplicitLocationContext({ locationHint: 'Oslo, NO', dayCountry: 'Norway' }),
    'Oslo, NO'
  );
});
