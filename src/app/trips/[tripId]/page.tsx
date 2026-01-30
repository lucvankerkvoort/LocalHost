'use client';

import dynamic from 'next/dynamic';
import { useEffect, use } from 'react';

// Reusing the GlobeItinerary component
const GlobeItinerary = dynamic(
  () => import('@/components/features/globe-itinerary'),
  { 
    ssr: false,
    loading: () => (
      <div className="h-screen flex items-center justify-center bg-[var(--deep-space-blue)]">
        <div className="text-white text-lg animate-pulse">Loading trip...</div>
      </div>
    ),
  }
);

export default function TripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);

  // Cesium CSS
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/cesium/Widgets/widgets.css';
    document.head.appendChild(link);
    return () => {
        // Checking if head still contains it before removing to avoid errors if unmounted/remounted quickly
        if (document.head.contains(link)) {
            document.head.removeChild(link);
        }
    };
  }, []);

  return (
    <div className="fixed inset-0 top-16 z-0"> {/* Adjust for navbar height */}
        <GlobeItinerary tripId={tripId} />
    </div>
  );
}
