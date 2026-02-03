'use client';

import Link from 'next/link';
import { formatPrice, formatDuration, formatGroupSize } from '@/lib/utils';
import { 
  BookOpen01Icon, 
  Location01Icon, 
  Moon01Icon, 
  MountainIcon, 
  PaintBoardIcon, 
  Restaurant01Icon, 
  SparklesIcon, 
  StarIcon, 
  UserGroupIcon, 
  Yoga01Icon,
  SmileIcon
} from 'hugeicons-react';

// Map database enum to display values
// Map database enum to display values
const CATEGORY_DISPLAY: Record<string, { label: string; icon: React.ReactNode }> = {
  FOOD_DRINK: { label: 'Food & Drink', icon: <Restaurant01Icon className="w-3.5 h-3.5" /> },
  ARTS_CULTURE: { label: 'Arts & Culture', icon: <PaintBoardIcon className="w-3.5 h-3.5" /> },
  OUTDOOR_ADVENTURE: { label: 'Outdoor & Adventure', icon: <MountainIcon className="w-3.5 h-3.5" /> },
  WELLNESS: { label: 'Wellness', icon: <Yoga01Icon className="w-3.5 h-3.5" /> },
  LEARNING: { label: 'Learning', icon: <BookOpen01Icon className="w-3.5 h-3.5" /> },
  NIGHTLIFE_SOCIAL: { label: 'Nightlife & Social', icon: <Moon01Icon className="w-3.5 h-3.5" /> },
  FAMILY: { label: 'Family', icon: <UserGroupIcon className="w-3.5 h-3.5" /> },
};

interface ExperienceCardProps {
  id: string;
  title: string;
  description?: string;
  category: string;
  city: string;
  country: string;
  duration: number;
  minGroupSize: number;
  maxGroupSize: number;
  price: number;
  currency: string;
  photos: string[];
  rating: number;
  reviewCount: number;
  host?: {
    name: string | null;
    image: string | null;
  };
}

export function ExperienceCard({
  id,
  title,
  category,
  city,
  country,
  duration,
  minGroupSize,
  maxGroupSize,
  price,
  currency,
  photos,
  rating,
  reviewCount,
  host,
}: ExperienceCardProps) {
  const categoryInfo = CATEGORY_DISPLAY[category] || { label: category, icon: <SparklesIcon className="w-3.5 h-3.5" /> };
  const mainImage = photos[0] || 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&h=400&fit=crop';

  return (
    <Link href={`/experience/${id}`}>
      <article className="group rounded-xl bg-white shadow-md overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer h-full flex flex-col">
        {/* Image */}
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={mainImage}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute top-3 left-3">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/95 text-xs font-medium shadow-sm">
              {categoryInfo.icon} {categoryInfo.label}
            </span>
          </div>
          {/* Duration badge */}
          <div className="absolute bottom-3 right-3">
            <span className="px-2.5 py-1 rounded-full bg-black/60 text-white text-xs font-medium">
              {formatDuration(duration)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 flex-1 flex flex-col">
          {/* Location */}
          <div className="flex items-center gap-1 text-sm text-[var(--muted-foreground)] mb-1">
            <Location01Icon className="w-3.5 h-3.5" />
            <span>{city}, {country}</span>
          </div>

          {/* Title */}
          <h3 className="font-semibold text-lg text-[var(--foreground)] mb-2 line-clamp-2 group-hover:text-[var(--primary)] transition-colors">
            {title}
          </h3>

          {/* Host */}
          {host && (
            <div className="flex items-center gap-2 mb-3">
              {host.image ? (
                <img
                  src={host.image}
                  alt={host.name || 'Host'}
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center text-xs">
                  {host.name?.[0] || '?'}
                </div>
              )}
              <span className="text-sm text-[var(--muted-foreground)]">
                Hosted by {host.name}
              </span>
            </div>
          )}

          {/* Group size */}
          <div className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] mb-3">
            <UserGroupIcon className="w-3.5 h-3.5" /> {formatGroupSize(minGroupSize, maxGroupSize)}
          </div>

          {/* Footer: Rating & Price */}
          <div className="mt-auto pt-3 border-t border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="text-[var(--accent)]"><StarIcon className="w-3.5 h-3.5 fill-current" /></span>
              <span className="font-medium">{rating.toFixed(1)}</span>
              <span className="text-[var(--muted-foreground)] text-sm">
                ({reviewCount})
              </span>
            </div>
            <div>
              <span className="font-bold text-lg text-[var(--foreground)]">
                {formatPrice(price, currency)}
              </span>
              <span className="text-sm text-[var(--muted-foreground)]">/person</span>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

// Skeleton loader for experience cards
export function ExperienceCardSkeleton() {
  return (
    <div className="rounded-xl bg-[var(--card)] shadow-md overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-[var(--muted)]/20" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-[var(--muted)]/20 rounded w-1/3" />
        <div className="h-5 bg-[var(--muted)]/20 rounded w-full" />
        <div className="h-5 bg-[var(--muted)]/20 rounded w-3/4" />
        <div className="h-4 bg-[var(--muted)]/20 rounded w-1/2" />
        <div className="pt-3 border-t border-[var(--border)] flex justify-between">
          <div className="h-4 bg-[var(--muted)]/20 rounded w-16" />
          <div className="h-5 bg-[var(--muted)]/20 rounded w-20" />
        </div>
      </div>
    </div>
  );
}
