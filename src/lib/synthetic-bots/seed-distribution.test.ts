import assert from 'node:assert/strict';
import test from 'node:test';

import type { ExperienceCategory } from '@prisma/client';

import { getPriceBand, summarizeSeedDistribution, validateSeedDistribution } from './seed-distribution';

const ALL_CATEGORIES: ExperienceCategory[] = [
  'FOOD_DRINK',
  'ARTS_CULTURE',
  'OUTDOOR_ADVENTURE',
  'WELLNESS',
  'LEARNING',
  'NIGHTLIFE_SOCIAL',
  'FAMILY',
];

test('getPriceBand maps prices into budget/mid/premium bands', () => {
  assert.equal(getPriceBand(2500), 'budget');
  assert.equal(getPriceBand(6000), 'mid');
  assert.equal(getPriceBand(17000), 'premium');
});

test('summarizeSeedDistribution and validateSeedDistribution pass for balanced sample', () => {
  const sample = Array.from({ length: 840 }, (_, index) => ({
    city: `City-${index % 30}`,
    category: ALL_CATEGORIES[index % ALL_CATEGORIES.length],
    price: index % 3 === 0 ? 4500 : index % 3 === 1 ? 9000 : 16000,
  }));

  const summary = summarizeSeedDistribution(sample);
  const errors = validateSeedDistribution(summary);

  assert.equal(summary.total, 840);
  assert.equal(Object.keys(summary.cityCounts).length, 30);
  assert.equal(errors.length, 0);
});

test('validateSeedDistribution flags low category coverage and city over-concentration', () => {
  const sample = Array.from({ length: 120 }, () => ({
    city: 'OnlyCity',
    category: 'FOOD_DRINK' as ExperienceCategory,
    price: 5000,
  }));

  const summary = summarizeSeedDistribution(sample);
  const errors = validateSeedDistribution(summary);

  assert.ok(errors.some((error) => error.includes('at least 30 cities')));
  assert.ok(errors.some((error) => error.includes('max city share')));
  assert.ok(errors.some((error) => error.includes('ARTS_CULTURE')));
});
