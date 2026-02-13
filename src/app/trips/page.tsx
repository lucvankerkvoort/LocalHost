import { Suspense } from 'react';
import { getUserTrips } from '@/actions/trips';
import { TripCard } from '@/components/trips/trip-card';
import { EmptyState } from '@/components/trips/empty-state';
import { CreateTripModal } from '@/components/trips/create-trip-modal';
import Link from 'next/link';
import type { Trip, TripAnchor } from '@prisma/client';

type TripWithStops = Trip & {
  stops: TripAnchor[];
};

export const dynamic = 'force-dynamic';

export default async function MyTripsPage() {
  const trips = await getUserTrips();

  return (
    <div className="min-h-screen bg-[#0f111a] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0f111a]/80 backdrop-blur-md sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-4">
                <Link href="/" className="text-xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                  Localhost
                </Link>
                <span className="text-gray-600">/</span>
                <span className="font-semibold text-white">My Trips</span>
            </div>
            
            {trips.length > 0 && (
                <CreateTripModal>
                    <button className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors shadow-lg shadow-amber-900/20">
                        + New Trip
                    </button>
                </CreateTripModal>
            )}
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Suspense fallback={<TripsLoading />}>
            {trips.length === 0 ? (
                <EmptyState />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {trips.map((trip) => (
                        <TripCard key={trip.id} trip={trip as TripWithStops} /> 
                    ))}
                    
                    {/* Ghost card for "Explore Experiences" promotion could go here */}
                </div>
            )}
        </Suspense>
      </main>
    </div>
  );
}

function TripsLoading() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3].map((i) => (
                <div key={i} className="h-64 bg-white/5 rounded-xl border border-white/5"></div>
            ))}
        </div>
    );
}
