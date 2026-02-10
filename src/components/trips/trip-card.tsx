'use client';

import { Plane, MapPin, Calendar, ArrowRight } from 'lucide-react';
import { Trip, TripAnchor } from '@prisma/client';
import Link from 'next/link';
import { format } from 'date-fns';
import { useState } from 'react';
import { deleteTrip } from '@/actions/trips';
import { useRouter } from 'next/navigation';

type TripWithStops = Trip & {
  stops: TripAnchor[];
};

interface TripCardProps {
  trip: TripWithStops;
}

export function TripCard({ trip }: TripCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  // Determine display location from first anchor
  const firstStop = trip.stops[0];
  const city = firstStop?.title || (firstStop?.locations as any)?.[0]?.name || 'Unknown Destination';
  
  // Format dates if available
  const dateRange = trip.startDate 
    ? format(new Date(trip.startDate), 'MMM d, yyyy') 
    : 'Dates TBD';

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation
    e.stopPropagation();

    if (!confirm('Are you sure you want to delete this trip? This action cannot be undone.')) {
        return;
    }

    setIsDeleting(true);
    try {
        const result = await deleteTrip(trip.id);
        if (!result.success) {
            alert('Failed to delete trip');
            setIsDeleting(false);
        }
        // Router refresh handled by server action revalidatePath, 
        // but we can ensure client update works
        router.refresh();
    } catch (err) {
        console.error(err);
        setIsDeleting(false);
    }
  };

  if (isDeleting) {
      return (
          <div className="bg-[#1a1f2e] border border-white/10 rounded-xl overflow-hidden h-[280px] flex items-center justify-center animate-pulse">
              <span className="text-gray-400">Deleting...</span>
          </div>
      );
  }

  return (
    <div className="relative group block">
        <Link href={`/trips/${trip.id}`} className="block h-full">
            <div className="bg-[#1a1f2e] border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-all shadow-lg hover:shadow-xl group-hover:-translate-y-1 h-full flex flex-col">
                {/* Placeholder Image Area */}
                <div className="h-40 bg-gradient-to-br from-indigo-900/50 to-purple-900/50 flex items-center justify-center relative shrink-0">
                    <Plane className="w-8 h-8 text-[var(--princeton-orange)]" />
                    <div className="absolute top-2 right-2 bg-black/40 px-2 py-1 rounded text-xs font-medium text-white/80 uppercase backdrop-blur-sm">
                        {trip.status}
                    </div>
                </div>
                
                {/* Content */}
                <div className="p-4 flex-1 flex flex-col">
                <h3 className="text-xl font-bold text-white mb-1 group-hover:text-amber-400 transition-colors truncate">
                    {trip.title}
                </h3>
                <div className="flex items-center text-sm text-gray-400 mb-2">
                    <span className="mr-2 flex items-center gap-1"><MapPin className="w-4 h-4" /> {city}</span>
                </div>
                <div className="text-xs text-gray-500 flex justify-between items-center mt-auto">
                    <span>{dateRange}</span>
                    <span>Last updated: {format(new Date(trip.updatedAt), 'MMM d')}</span>
                </div>
                </div>
            </div>
        </Link>
        
        {/* Delete Button - Absolute positioned to appear on hover */}
        <button
            onClick={handleDelete}
            className="absolute top-2 right-2 p-2 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
            title="Delete Trip"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    </div>
  );
}
