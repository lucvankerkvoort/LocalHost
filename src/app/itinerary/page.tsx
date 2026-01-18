'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';

// Dynamic import for Cesium components (no SSR)
const GlobeItinerary = dynamic(
  () => import('@/components/features/globe-itinerary'),
  { 
    ssr: false,
    loading: () => (
      <div className="h-screen flex items-center justify-center bg-[var(--deep-space-blue)]">
        <div className="text-white text-lg animate-pulse">Loading globe...</div>
      </div>
    ),
  }
);

export default function ItineraryPage() {
  // Load Cesium CSS via useEffect since we can't use next/head in client components
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/cesium/Widgets/widgets.css';
    document.head.appendChild(link);
    
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  return <GlobeItinerary />;
}
