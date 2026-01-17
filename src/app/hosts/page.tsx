'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar, HostCard } from '@/components/features';
import { HOSTS, getHostsByCity, getHostsByInterests, getAllCities } from '@/lib/data/hosts';

export default function HostsPage() {
  const searchParams = useSearchParams();
  const cityFilter = searchParams.get('city');
  const interestsParam = searchParams.get('interests');

  const filteredHosts = useMemo(() => {
    let result = [...HOSTS];

    // Filter by city if provided
    if (cityFilter) {
      const cityHosts = getHostsByCity(cityFilter);
      if (cityHosts.length > 0) {
        result = cityHosts;
      }
    }

    // Filter/sort by interests if provided
    if (interestsParam) {
      const interests = interestsParam.split(',').map(i => i.trim());
      if (interests.length > 0) {
        const matchedHosts = getHostsByInterests(interests);
        if (matchedHosts.length > 0) {
          // If we have city filter too, intersect
          if (cityFilter) {
            result = result.filter(h => matchedHosts.some(m => m.id === h.id));
          } else {
            result = matchedHosts;
          }
        }
      }
    }

    return result;
  }, [cityFilter, interestsParam]);

  const cities = getAllCities();

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      {/* Hero */}
      <section className="pt-24 pb-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[var(--sand-beige)] to-[var(--background)]">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--foreground)] mb-2">
            Meet the Locals
          </h1>
          <p className="text-[var(--muted-foreground)]">
            Real people ready to share their world with you
          </p>
        </div>
      </section>

      {/* Filters */}
      <section className="px-4 sm:px-6 lg:px-8 py-6 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-4">
          <span className="text-sm text-[var(--muted-foreground)]">Filter by city:</span>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/hosts"
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                !cityFilter
                  ? 'bg-[var(--sunset-orange)] text-white'
                  : 'bg-[var(--sand-beige)] text-[var(--foreground)] hover:bg-[var(--sand-beige-light)]'
              }`}
            >
              All
            </Link>
            {cities.map((city) => (
              <Link
                key={city}
                href={`/hosts?city=${encodeURIComponent(city)}`}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  cityFilter === city
                    ? 'bg-[var(--sunset-orange)] text-white'
                    : 'bg-[var(--sand-beige)] text-[var(--foreground)] hover:bg-[var(--sand-beige-light)]'
                }`}
              >
                {city}
              </Link>
            ))}
          </div>

          {interestsParam && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-[var(--muted-foreground)]">Matching interests:</span>
              <span className="px-3 py-1.5 rounded-full text-sm bg-[var(--ocean-blue)] text-white">
                "{interestsParam.slice(0, 30)}{interestsParam.length > 30 ? '...' : ''}"
              </span>
              <Link
                href={cityFilter ? `/hosts?city=${cityFilter}` : '/hosts'}
                className="text-sm text-[var(--sunset-orange)] hover:underline"
              >
                Clear
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Hosts Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {filteredHosts.length > 0 ? (
          <>
            <p className="text-sm text-[var(--muted-foreground)] mb-6">
              {filteredHosts.length} {filteredHosts.length === 1 ? 'local' : 'locals'} found
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredHosts.map((host) => (
                <HostCard key={host.id} host={host} />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🌍</div>
            <h3 className="text-xl font-semibold text-[var(--foreground)] mb-2">
              No locals found in {cityFilter || 'this area'}
            </h3>
            <p className="text-[var(--muted-foreground)] mb-4">
              We're always adding new hosts. Check back soon!
            </p>
            <Link
              href="/hosts"
              className="text-[var(--sunset-orange)] hover:underline font-medium"
            >
              View all hosts
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
