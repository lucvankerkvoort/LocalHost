import assert from 'node:assert/strict';
import test from 'node:test';

import { HOSTS, type Host, type HostExperience } from './data/hosts';
import {
  getAllCategories,
  scoreExperience,
  scoreHost,
  semanticSearchExperiences,
  semanticSearchHosts,
  type SearchIntent,
} from './semantic-search';

function makeIntent(overrides: Partial<SearchIntent> = {}): SearchIntent {
  return {
    categories: [],
    keywords: [],
    preferences: [],
    activities: [],
    ...overrides,
  };
}

test('scoreHost applies boosts for matching location/category/keywords', () => {
  const host = HOSTS.find((candidate) => candidate.city === 'Kyoto');
  assert.ok(host, 'Expected at least one host in Kyoto');

  const scored = scoreHost(
    host!,
    makeIntent({
      location: 'Kyoto',
      categories: ['outdoor-adventure'],
      keywords: ['hiking'],
    })
  );

  assert.ok(scored.score > 0);
  assert.equal(
    scored.matchReasons.some((reason) => reason.includes('Located in Kyoto')),
    true
  );
});

test('scoreHost can return 0 for a non-matching host with no quality boosts', () => {
  const experience: HostExperience = {
    id: 'exp-1',
    title: 'Indoor board games',
    description: 'A quiet strategy session',
    category: 'LEARNING',
    duration: 90,
    price: 2000,
    rating: 0,
    reviewCount: 0,
    photos: [],
  };
  const host: Host = {
    id: 'host-1',
    name: 'Test Host',
    photo: 'photo.jpg',
    city: 'Reykjavik',
    country: 'Iceland',
    bio: 'No matching terms here',
    quote: '',
    interests: ['board games'],
    languages: ['English'],
    responseTime: 'within a day',
    memberSince: '2025',
    experiences: [experience],
  };

  const scored = scoreHost(
    host,
    makeIntent({
      location: 'Tokyo',
      categories: ['food-drink'],
      keywords: ['hiking'],
    })
  );

  assert.equal(scored.score, 0);
  assert.deepEqual(scored.matchReasons, []);
});

test('scoreExperience attaches host metadata and produces match reasons', () => {
  const host = HOSTS[0];
  const experience = host.experiences[0];
  const scored = scoreExperience(
    experience,
    host,
    makeIntent({
      location: host.city,
      categories: ['food-drink'],
      keywords: ['cooking'],
    })
  );

  assert.equal(scored.experience.hostId, host.id);
  assert.equal(scored.experience.hostName, host.name);
  assert.equal(scored.experience.city, host.city);
  assert.ok(scored.score > 0);
  assert.ok(scored.matchReasons.length > 0);
});

test('semanticSearchHosts returns top N results respecting limit', () => {
  const results = semanticSearchHosts(makeIntent({ keywords: ['food'] }), 3);
  assert.equal(results.length, 3);
});

test('semanticSearchHosts filters by location when matching hosts exist', () => {
  const results = semanticSearchHosts(makeIntent({ location: 'Kyoto' }), 10);
  assert.ok(results.length > 0);
  assert.equal(
    results.every(
      (result) =>
        result.host.city.toLowerCase().includes('kyoto') ||
        result.host.country.toLowerCase().includes('kyoto')
    ),
    true
  );
});

test('semanticSearchHosts falls back to all hosts when location has no matches', () => {
  const results = semanticSearchHosts(makeIntent({ location: 'Atlantis' }), 5);
  assert.equal(results.length, 5);
  assert.equal(
    results.some(
      (result) =>
        !result.host.city.toLowerCase().includes('atlantis') &&
        !result.host.country.toLowerCase().includes('atlantis')
    ),
    true
  );
});

test('semanticSearchExperiences filters by location and respects result limit', () => {
  const results = semanticSearchExperiences(
    makeIntent({ location: 'Rome', keywords: ['market'] }),
    10
  );
  assert.ok(results.length > 0);
  assert.equal(
    results.every(
      (result) =>
        result.experience.city.toLowerCase().includes('rome') ||
        result.experience.country.toLowerCase().includes('rome')
    ),
    true
  );
});

test('semanticSearchExperiences returns empty when limit is 0', () => {
  const results = semanticSearchExperiences(makeIntent({ keywords: ['food'] }), 0);
  assert.deepEqual(results, []);
});

test('getAllCategories returns all category keys without duplicates', () => {
  const categories = getAllCategories();
  assert.equal(categories.includes('FOOD_DRINK'), true);
  assert.equal(categories.includes('ARTS_CULTURE'), true);
  assert.equal(categories.length, new Set(categories).size);
});

test('semanticSearchHosts returns empty when limit is 0', () => {
  const results = semanticSearchHosts(
    {
      categories: [],
      keywords: ['food'],
      preferences: [],
      activities: [],
    },
    0
  );

  assert.deepEqual(results, []);
});
