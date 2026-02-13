import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHostMarkersFromPlannerHosts,
  derivePlannerHosts,
  normalizeCity,
  type PlannerExperienceSource,
} from './experiences';

function makeExperience(overrides: Partial<PlannerExperienceSource>): PlannerExperienceSource {
  return {
    id: 'exp-1',
    title: 'Sample',
    description: 'Sample desc',
    category: 'ARTS_CULTURE',
    duration: 120,
    price: 5000,
    rating: 4.2,
    reviewCount: 10,
    photos: ['https://example.com/photo.jpg'],
    city: 'Amsterdam',
    country: 'Netherlands',
    latitude: 52.3676,
    longitude: 4.9041,
    host: {
      id: 'host-1',
      name: 'Host One',
      image: 'https://example.com/host.jpg',
      bio: 'Bio',
      quote: 'Quote',
      responseTime: 'within a day',
      languages: ['English'],
      interests: ['art'],
      city: 'Amsterdam',
      country: 'Netherlands',
      isHost: true,
    },
    ...overrides,
  };
}

test('normalizeCity trims and lowercases', () => {
  assert.equal(normalizeCity('  Amsterdam '), 'amsterdam');
});

test('derivePlannerHosts groups, filters, and sorts', () => {
  const experiences: PlannerExperienceSource[] = [
    makeExperience({
      id: 'exp-1',
      title: 'Lower Rated',
      rating: 4.2,
      price: 4000,
      host: { ...makeExperience({}).host, id: 'host-1', name: 'Host A' },
    }),
    makeExperience({
      id: 'exp-2',
      title: 'Top Rated',
      rating: 5.0,
      price: 6000,
      host: { ...makeExperience({}).host, id: 'host-1', name: 'Host A' },
    }),
    makeExperience({
      id: 'exp-3',
      title: 'Other Host',
      rating: 4.9,
      price: 3000,
      host: { ...makeExperience({}).host, id: 'host-2', name: 'Host B' },
    }),
    makeExperience({
      id: 'exp-4',
      title: 'Wrong City',
      city: 'Paris',
      host: { ...makeExperience({}).host, id: 'host-3', name: 'Host C' },
    }),
  ];

  const hosts = derivePlannerHosts('Amsterdam', experiences);

  assert.equal(hosts.length, 2);
  assert.equal(hosts[0].id, 'host-2');
  assert.equal(hosts[1].id, 'host-1');

  const hostAExperiences = hosts.find((host) => host.id === 'host-1')?.experiences ?? [];
  assert.equal(hostAExperiences[0]?.title, 'Top Rated');
  assert.equal(hostAExperiences[1]?.title, 'Lower Rated');
});

test('derivePlannerHosts excludes experiences without coordinates', () => {
  const experiences: PlannerExperienceSource[] = [
    makeExperience({
      id: 'exp-ghost',
      city: 'GhostTown',
      country: 'Nowhere',
      latitude: null,
      longitude: null,
      host: { ...makeExperience({}).host, id: 'host-ghost', name: 'Ghost Host' },
    }),
  ];

  const hosts = derivePlannerHosts('GhostTown', experiences);
  assert.equal(hosts.length, 0);
});

test('buildHostMarkersFromPlannerHosts averages rating and counts experiences', () => {
  const hosts = derivePlannerHosts('Amsterdam', [
    makeExperience({ id: 'exp-1', rating: 4.2, host: { ...makeExperience({}).host, id: 'host-1' } }),
    makeExperience({ id: 'exp-2', rating: 5.0, host: { ...makeExperience({}).host, id: 'host-1' } }),
  ]);

  const markers = buildHostMarkersFromPlannerHosts(hosts);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].experienceCount, 2);
  assert.equal(markers[0].rating, 4.6);
});
