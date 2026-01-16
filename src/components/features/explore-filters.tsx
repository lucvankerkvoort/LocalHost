'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';

// Category options matching database enum
const CATEGORIES = [
  { value: 'FOOD_DRINK', label: 'Food & Drink', icon: '🍽️' },
  { value: 'ARTS_CULTURE', label: 'Arts & Culture', icon: '🎨' },
  { value: 'OUTDOOR_ADVENTURE', label: 'Outdoor', icon: '🏔️' },
  { value: 'WELLNESS', label: 'Wellness', icon: '🧘' },
  { value: 'LEARNING', label: 'Learning', icon: '📚' },
  { value: 'NIGHTLIFE_SOCIAL', label: 'Nightlife', icon: '🌃' },
  { value: 'FAMILY', label: 'Family', icon: '👨‍👩‍👧‍👦' },
];

const PRICE_RANGES = [
  { value: '0-25', label: 'Under $25' },
  { value: '25-50', label: '$25 - $50' },
  { value: '50-100', label: '$50 - $100' },
  { value: '100+', label: '$100+' },
];

const GROUP_SIZES = [
  { value: '1-2', label: '1-2 people' },
  { value: '3-6', label: '3-6 people' },
  { value: '7+', label: '7+ people' },
];

export interface FilterState {
  categories: string[];
  priceRange: string | null;
  groupSize: string | null;
  searchQuery: string;
}

interface ExploreFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  resultCount: number;
}

export function ExploreFilters({ filters, onFiltersChange, resultCount }: ExploreFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleCategory = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter((c) => c !== category)
      : [...filters.categories, category];
    onFiltersChange({ ...filters, categories: newCategories });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      categories: [],
      priceRange: null,
      groupSize: null,
      searchQuery: '',
    });
  };

  const hasActiveFilters =
    filters.categories.length > 0 ||
    filters.priceRange !== null ||
    filters.groupSize !== null ||
    filters.searchQuery !== '';

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      {/* Search */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
          Search
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="Search experiences..."
            value={filters.searchQuery}
            onChange={(e) => onFiltersChange({ ...filters, searchQuery: e.target.value })}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--sunset-orange)] transition-colors"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Categories */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-[var(--foreground)] mb-3">
          Categories
        </label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => toggleCategory(cat.value)}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
                transition-all duration-200
                ${
                  filters.categories.includes(cat.value)
                    ? 'bg-[var(--sunset-orange)] text-white'
                    : 'bg-[var(--sand-beige-light)] text-[var(--foreground)] hover:bg-[var(--sand-beige)]'
                }
              `}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Expandable filters */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors mb-4"
      >
        <svg
          className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        {isExpanded ? 'Show less' : 'More filters'}
      </button>

      {isExpanded && (
        <div className="space-y-6 animate-fade-in">
          {/* Price Range */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-3">
              Price Range
            </label>
            <div className="space-y-2">
              {PRICE_RANGES.map((range) => (
                <label
                  key={range.value}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="priceRange"
                    value={range.value}
                    checked={filters.priceRange === range.value}
                    onChange={(e) =>
                      onFiltersChange({
                        ...filters,
                        priceRange: e.target.checked ? range.value : null,
                      })
                    }
                    className="w-4 h-4 text-[var(--sunset-orange)] focus:ring-[var(--sunset-orange)]"
                  />
                  <span className="text-sm text-[var(--foreground)]">{range.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Group Size */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-3">
              Group Size
            </label>
            <div className="space-y-2">
              {GROUP_SIZES.map((size) => (
                <label
                  key={size.value}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="groupSize"
                    value={size.value}
                    checked={filters.groupSize === size.value}
                    onChange={(e) =>
                      onFiltersChange({
                        ...filters,
                        groupSize: e.target.checked ? size.value : null,
                      })
                    }
                    className="w-4 h-4 text-[var(--sunset-orange)] focus:ring-[var(--sunset-orange)]"
                  />
                  <span className="text-sm text-[var(--foreground)]">{size.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-[var(--border)] flex items-center justify-between">
        <span className="text-sm text-[var(--muted-foreground)]">
          {resultCount} {resultCount === 1 ? 'experience' : 'experiences'} found
        </span>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-sm text-[var(--sunset-orange)] hover:underline"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

// Mobile filter drawer trigger
export function MobileFilterTrigger({ onClick, activeCount }: { onClick: () => void; activeCount: number }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="lg:hidden flex items-center gap-2"
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
        />
      </svg>
      Filters
      {activeCount > 0 && (
        <span className="ml-1 px-2 py-0.5 rounded-full bg-[var(--sunset-orange)] text-white text-xs">
          {activeCount}
        </span>
      )}
    </Button>
  );
}
