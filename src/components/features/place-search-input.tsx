'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, MapPin } from 'lucide-react';
import type { PlaceSearchResult } from '@/app/api/places/search/route';

interface Props {
  /** Optional city/country to bias results, e.g. "Tokyo, Japan" */
  context?: string;
  placeholder?: string;
  onSelect: (place: PlaceSearchResult) => void;
  autoFocus?: boolean;
}

const CATEGORY_ICONS: Record<PlaceSearchResult['category'], string> = {
  restaurant: '🍽️',
  museum: '🏛️',
  park: '🌿',
  neighborhood: '📍',
  landmark: '🗺️',
  other: '📌',
};

export function PlaceSearchInput({ context, placeholder = 'Search for a place…', onSelect, autoFocus }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: q.trim(), limit: '6' });
      if (context) params.set('context', context);
      const resp = await fetch(`/api/places/search?${params}`);
      if (!resp.ok) throw new Error('search failed');
      const data = await resp.json() as { results: PlaceSearchResult[] };
      setResults(data.results);
      setOpen(data.results.length > 0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [context]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 350);
  };

  const handleSelect = (place: PlaceSearchResult) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onSelect(place);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input */}
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 focus-within:border-[var(--princeton-orange)] transition-colors">
        {loading
          ? <Loader2 className="w-3.5 h-3.5 text-[var(--muted-foreground)] animate-spin flex-shrink-0" />
          : <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] flex-shrink-0" />
        }
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none"
        />
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg overflow-hidden">
          {results.map((place) => (
            <li key={place.placeId}>
              <button
                type="button"
                onClick={() => handleSelect(place)}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-[var(--muted)]/30 transition-colors text-left"
              >
                <span className="text-base leading-none mt-0.5 flex-shrink-0">
                  {CATEGORY_ICONS[place.category]}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground)] truncate">{place.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)] truncate flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                    {place.address}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
