'use client';

import { Trip, TripStop } from '@prisma/client';
import Link from 'next/link';
import { format } from 'date-fns';

type TripWithStops = Trip & {
  stops: TripStop[];
};

interface TripCardProps {
  trip: TripWithStops;
}

export function TripCard({ trip }: TripCardProps) {
  // Determine display location
  const city = trip.stops[0]?.city || 'Unknown Destination';
  
  // Format dates if available
  const dateRange = trip.startDate 
    ? format(new Date(trip.startDate), 'MMM d, yyyy') 
    : 'Dates TBD';

  return (
    <Link href={`/trips/${trip.id}`} className="group block">
      <div className="bg-[#1a1f2e] border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-all shadow-lg hover:shadow-xl group-hover:-translate-y-1">
        {/* Placeholder Image Area */}
        <div className="h-40 bg-gradient-to-br from-indigo-900/50 to-purple-900/50 flex items-center justify-center relative">
            <span className="text-4xl">✈️</span>
            <div className="absolute top-2 right-2 bg-black/40 px-2 py-1 rounded text-xs font-medium text-white/80 uppercase backdrop-blur-sm">
                {trip.status}
            </div>
        </div>
        
        {/* Content */}
        <div className="p-4">
          <h3 className="text-xl font-bold text-white mb-1 group-hover:text-amber-400 transition-colors">
            {trip.title}
          </h3>
          <div className="flex items-center text-sm text-gray-400 mb-2">
            <span className="mr-2">📍 {city}</span>
          </div>
          <div className="text-xs text-gray-500 flex justify-between items-center mt-4">
            <span>{dateRange}</span>
            <span>Last updated: {format(new Date(trip.updatedAt), 'MMM d')}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
