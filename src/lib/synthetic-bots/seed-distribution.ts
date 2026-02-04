import type { ExperienceCategory } from '@prisma/client';

export type PriceBand = 'budget' | 'mid' | 'premium';

export interface SeedExperienceSample {
  city: string;
  category: ExperienceCategory;
  price: number;
}

export interface SeedDistributionSummary {
  total: number;
  cityCounts: Record<string, number>;
  categoryCounts: Record<ExperienceCategory, number>;
  priceBandCounts: Record<PriceBand, number>;
  maxCityShare: number;
}

const ALL_CATEGORIES: ExperienceCategory[] = [
  'FOOD_DRINK',
  'ARTS_CULTURE',
  'OUTDOOR_ADVENTURE',
  'WELLNESS',
  'LEARNING',
  'NIGHTLIFE_SOCIAL',
  'FAMILY',
];

export function getPriceBand(price: number): PriceBand {
  if (price < 6000) return 'budget';
  if (price <= 13000) return 'mid';
  return 'premium';
}

export function summarizeSeedDistribution(experiences: SeedExperienceSample[]): SeedDistributionSummary {
  const cityCounts: Record<string, number> = {};
  const categoryCounts = ALL_CATEGORIES.reduce<Record<ExperienceCategory, number>>((acc, category) => {
    acc[category] = 0;
    return acc;
  }, {} as Record<ExperienceCategory, number>);
  const priceBandCounts: Record<PriceBand, number> = {
    budget: 0,
    mid: 0,
    premium: 0,
  };

  for (const experience of experiences) {
    cityCounts[experience.city] = (cityCounts[experience.city] ?? 0) + 1;
    categoryCounts[experience.category] = (categoryCounts[experience.category] ?? 0) + 1;
    priceBandCounts[getPriceBand(experience.price)] += 1;
  }

  const total = experiences.length;
  const maxCityCount = Object.values(cityCounts).reduce((max, count) => Math.max(max, count), 0);
  const maxCityShare = total === 0 ? 0 : maxCityCount / total;

  return {
    total,
    cityCounts,
    categoryCounts,
    priceBandCounts,
    maxCityShare,
  };
}

export function validateSeedDistribution(summary: SeedDistributionSummary): string[] {
  const errors: string[] = [];
  const cityCount = Object.keys(summary.cityCounts).length;
  if (cityCount < 30) {
    errors.push(`Expected at least 30 cities but found ${cityCount}`);
  }

  if (summary.maxCityShare > 0.15) {
    errors.push(`Expected max city share <= 15% but found ${(summary.maxCityShare * 100).toFixed(2)}%`);
  }

  for (const [category, count] of Object.entries(summary.categoryCounts) as Array<[ExperienceCategory, number]>) {
    const share = summary.total === 0 ? 0 : count / summary.total;
    if (share < 0.08) {
      errors.push(`Expected category ${category} >= 8% but found ${(share * 100).toFixed(2)}%`);
    }
  }

  if (summary.priceBandCounts.budget === 0 || summary.priceBandCounts.mid === 0 || summary.priceBandCounts.premium === 0) {
    errors.push('Expected budget, mid, and premium price bands to all be represented');
  }

  return errors;
}
