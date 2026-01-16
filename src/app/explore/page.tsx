'use client';

import { useState, useMemo } from 'react';
import { Navbar } from '@/components/features';
import {
  ExperienceCard,
  ExperienceCardSkeleton,
  ExploreFilters,
  SortDropdown,
  MobileFilterTrigger,
} from '@/components/features';
import type { FilterState, SortOption } from '@/components/features';

// Mock experiences data (will be replaced with API call)
const MOCK_EXPERIENCES = [
  {
    id: '1',
    title: 'Sunset Cooking Class with Nonna Maria',
    description: 'Learn traditional Roman recipes in a family home',
    category: 'FOOD_DRINK',
    city: 'Rome',
    country: 'Italy',
    duration: 180,
    minGroupSize: 2,
    maxGroupSize: 6,
    price: 7500,
    currency: 'USD',
    photos: ['https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=600&h=400&fit=crop'],
    rating: 4.9,
    reviewCount: 127,
    host: { name: 'Maria Rossi', image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop' },
    createdAt: new Date('2024-01-15'),
  },
  {
    id: '2',
    title: 'Hidden Murals Walking Tour',
    description: 'Discover street art gems in the city',
    category: 'ARTS_CULTURE',
    city: 'Mexico City',
    country: 'Mexico',
    duration: 150,
    minGroupSize: 1,
    maxGroupSize: 8,
    price: 3500,
    currency: 'USD',
    photos: ['https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=600&h=400&fit=crop'],
    rating: 4.8,
    reviewCount: 89,
    host: { name: 'Carlos Mendez', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop' },
    createdAt: new Date('2024-02-20'),
  },
  {
    id: '3',
    title: 'Mountain Sunrise Hike & Breakfast',
    description: 'Early morning trek with traditional breakfast',
    category: 'OUTDOOR_ADVENTURE',
    city: 'Kyoto',
    country: 'Japan',
    duration: 240,
    minGroupSize: 2,
    maxGroupSize: 4,
    price: 5000,
    currency: 'USD',
    photos: ['https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600&h=400&fit=crop'],
    rating: 5.0,
    reviewCount: 64,
    host: { name: 'Yuki Tanaka', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop' },
    createdAt: new Date('2024-03-10'),
  },
  {
    id: '4',
    title: 'Vineyard Tour & Wine Tasting',
    description: 'Explore local vineyards and sample premium wines',
    category: 'FOOD_DRINK',
    city: 'Napa Valley',
    country: 'USA',
    duration: 300,
    minGroupSize: 2,
    maxGroupSize: 10,
    price: 12000,
    currency: 'USD',
    photos: ['https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=600&h=400&fit=crop'],
    rating: 4.7,
    reviewCount: 56,
    host: { name: 'David Chen', image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop' },
    createdAt: new Date('2024-04-05'),
  },
  {
    id: '5',
    title: 'Yoga & Meditation at Sunrise',
    description: 'Find inner peace with ocean views',
    category: 'WELLNESS',
    city: 'Bali',
    country: 'Indonesia',
    duration: 90,
    minGroupSize: 1,
    maxGroupSize: 12,
    price: 2500,
    currency: 'USD',
    photos: ['https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&h=400&fit=crop'],
    rating: 4.9,
    reviewCount: 203,
    host: { name: 'Wayan Sari', image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop' },
    createdAt: new Date('2024-05-01'),
  },
  {
    id: '6',
    title: 'Photography Walk: City Lights',
    description: 'Capture stunning night photography',
    category: 'LEARNING',
    city: 'Tokyo',
    country: 'Japan',
    duration: 180,
    minGroupSize: 1,
    maxGroupSize: 6,
    price: 8000,
    currency: 'USD',
    photos: ['https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600&h=400&fit=crop'],
    rating: 4.8,
    reviewCount: 42,
    host: { name: 'Kenji Yamamoto', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop' },
    createdAt: new Date('2024-06-15'),
  },
];

export default function ExplorePage() {
  const [filters, setFilters] = useState<FilterState>({
    categories: [],
    priceRange: null,
    groupSize: null,
    searchQuery: '',
  });
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Filter and sort experiences
  const filteredExperiences = useMemo(() => {
    let result = [...MOCK_EXPERIENCES];

    // Filter by search query
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      result = result.filter(
        (exp) =>
          exp.title.toLowerCase().includes(query) ||
          exp.description.toLowerCase().includes(query) ||
          exp.city.toLowerCase().includes(query) ||
          exp.country.toLowerCase().includes(query)
      );
    }

    // Filter by categories
    if (filters.categories.length > 0) {
      result = result.filter((exp) => filters.categories.includes(exp.category));
    }

    // Filter by price range
    if (filters.priceRange) {
      const [min, max] = filters.priceRange.split('-').map((v) => (v === '+' ? Infinity : parseInt(v) * 100));
      result = result.filter((exp) => exp.price >= min && (max === Infinity || exp.price < max));
    }

    // Filter by group size
    if (filters.groupSize) {
      if (filters.groupSize === '1-2') {
        result = result.filter((exp) => exp.minGroupSize <= 2);
      } else if (filters.groupSize === '3-6') {
        result = result.filter((exp) => exp.maxGroupSize >= 3 && exp.minGroupSize <= 6);
      } else if (filters.groupSize === '7+') {
        result = result.filter((exp) => exp.maxGroupSize >= 7);
      }
    }

    // Sort
    switch (sortBy) {
      case 'rating':
        result.sort((a, b) => b.rating - a.rating);
        break;
      case 'price-low':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price-high':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'newest':
        result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      default:
        // relevance - keep original order
        break;
    }

    return result;
  }, [filters, sortBy]);

  const activeFilterCount =
    filters.categories.length +
    (filters.priceRange ? 1 : 0) +
    (filters.groupSize ? 1 : 0);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      {/* Hero */}
      <section className="pt-24 pb-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[var(--sand-beige)] to-[var(--background)]">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--foreground)] mb-2">
            Explore Experiences
          </h1>
          <p className="text-[var(--muted-foreground)]">
            Discover authentic activities hosted by verified locals around the world
          </p>
        </div>
      </section>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filters sidebar - desktop */}
          <aside className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-24">
              <ExploreFilters
                filters={filters}
                onFiltersChange={setFilters}
                resultCount={filteredExperiences.length}
              />
            </div>
          </aside>

          {/* Experience grid */}
          <div className="flex-1">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <MobileFilterTrigger
                  onClick={() => setShowMobileFilters(true)}
                  activeCount={activeFilterCount}
                />
                <span className="text-sm text-[var(--muted-foreground)] hidden sm:inline">
                  {filteredExperiences.length} {filteredExperiences.length === 1 ? 'experience' : 'experiences'}
                </span>
              </div>
              <SortDropdown value={sortBy} onChange={setSortBy} />
            </div>

            {/* Grid */}
            {filteredExperiences.length > 0 ? (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredExperiences.map((experience) => (
                  <ExperienceCard key={experience.id} {...experience} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-xl font-semibold text-[var(--foreground)] mb-2">
                  No experiences found
                </h3>
                <p className="text-[var(--muted-foreground)] mb-4">
                  Try adjusting your filters or search query
                </p>
                <button
                  onClick={() =>
                    setFilters({
                      categories: [],
                      priceRange: null,
                      groupSize: null,
                      searchQuery: '',
                    })
                  }
                  className="text-[var(--sunset-orange)] hover:underline font-medium"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile filter drawer */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowMobileFilters(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-[var(--background)] overflow-y-auto animate-slide-up">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="font-semibold text-lg">Filters</h2>
              <button
                onClick={() => setShowMobileFilters(false)}
                className="p-2 hover:bg-[var(--sand-beige)] rounded-lg transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <ExploreFilters
                filters={filters}
                onFiltersChange={setFilters}
                resultCount={filteredExperiences.length}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
