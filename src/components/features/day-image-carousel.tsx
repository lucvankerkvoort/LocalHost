'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { buildItineraryImageListUrl } from '@/lib/images/unsplash';

const CAROUSEL_IMAGE_COUNT = 5;
const AUTO_ROTATE_MS = 5000;

interface DayImageCarouselProps {
  city?: string;
  country?: string;
}

/**
 * City-level image carousel displayed at the top of each itinerary day.
 * Fetches images from Unsplash for the city, falling back to the country.
 */
export function DayImageCarousel({ city, country }: DayImageCarouselProps) {
  const [images, setImages] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch images for city, fallback to country
  useEffect(() => {
    let cancelled = false;

    async function fetchImages() {
      // Try city first
      if (city) {
        const url = buildItineraryImageListUrl({
          city,
          count: CAROUSEL_IMAGE_COUNT,
          width: 800,
          height: 400,
        });
        if (url) {
          try {
            const res = await fetch(url);
            const data = await res.json();
            if (!cancelled && data.images?.length > 0) {
              setImages(data.images);
              setLoaded(true);
              return;
            }
          } catch { /* fall through to country */ }
        }
      }

      // Fallback to country
      if (country) {
        const url = buildItineraryImageListUrl({
          city: country,
          count: CAROUSEL_IMAGE_COUNT,
          width: 800,
          height: 400,
        });
        if (url) {
          try {
            const res = await fetch(url);
            const data = await res.json();
            if (!cancelled && data.images?.length > 0) {
              setImages(data.images);
              setLoaded(true);
              return;
            }
          } catch { /* no-op */ }
        }
      }

      if (!cancelled) setLoaded(true);
    }

    fetchImages();
    return () => { cancelled = true; };
  }, [city, country]);

  // Auto-rotate
  useEffect(() => {
    if (images.length <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, AUTO_ROTATE_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [images.length]);

  const goTo = useCallback((index: number) => {
    setActiveIndex(index);
    // Reset auto-rotate timer on manual navigation
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, AUTO_ROTATE_MS);
  }, [images.length]);

  if (!loaded || images.length === 0) {
    // Skeleton placeholder
    return (
      <div className="w-full h-[140px] rounded-lg mb-3 bg-[var(--muted)]/20 animate-pulse" />
    );
  }

  return (
    <div className="relative w-full h-[140px] rounded-lg mb-3 overflow-hidden group/carousel">
      {/* Images */}
      {images.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={`${city || country || 'Destination'} photo ${i + 1}`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
            i === activeIndex ? 'opacity-100' : 'opacity-0'
          }`}
          loading={i === 0 ? 'eager' : 'lazy'}
        />
      ))}

      {/* Gradient overlay with city name */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
      {city && (
        <span className="absolute bottom-2 left-3 text-white/90 text-xs font-semibold tracking-wide drop-shadow-md pointer-events-none">
          {city}
        </span>
      )}

      {/* Dot navigation */}
      {images.length > 1 && (
        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === activeIndex
                  ? 'bg-white scale-125'
                  : 'bg-white/50 hover:bg-white/80'
              }`}
              aria-label={`Photo ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
