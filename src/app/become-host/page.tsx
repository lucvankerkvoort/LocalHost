'use client';

import { useEffect } from 'react';
import { useAppSelector } from '@/store/hooks';
import { selectHostCreation } from '@/store/host-creation-slice';
import { SummaryPanel } from '@/components/features/host-creation/summary-panel';
import HostCreationMap from '@/components/features/host-creation/host-creation-map';
import { HostCreationToolListener } from '@/components/features/host-creation/tool-listener';
import { PlaceMarkerData } from '@/types/globe';

export default function BecomeHostPage() {
  const { stops, cityLat, cityLng } = useAppSelector(selectHostCreation);

  useEffect(() => {
    const href = '/cesium/Widgets/widgets.css';
    const existing = document.querySelector<HTMLLinkElement>(`link[href="${href}"]`);
    if (existing) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);

    return () => {
      link.remove();
    };
  }, []);

  // Map stops to markers
  const mapMarkers: PlaceMarkerData[] = stops.map(stop => ({
    id: stop.id,
    name: stop.name,
    lat: stop.lat,
    lng: stop.lng,
    category: 'stop',
  }));

  // Initial camera override if city is set
  const initialCamera = cityLat && cityLng ? {
    lat: cityLat,
    lng: cityLng,
    height: 10000,
  } : undefined;

  return (
    <div className="h-screen w-screen flex bg-[var(--background)] overflow-hidden">
      {/* Left Panel: Summary (30%) */}
      <div className="flex-none w-[30%] min-w-[320px] h-full">
        <SummaryPanel />
      </div>

      {/* Right Panel: Map (70%) */}
      <div className="flex-none w-[70%] h-full relative bg-[var(--deep-space-blue)]">
        {/* Map */}
        <HostCreationMap 
          placeMarkers={mapMarkers}
          destinations={[]} // No itinerary destinations
          visualTarget={initialCamera} 
          cityMarkers={[]}
          routeMarkers={[]}
          hostMarkers={[]}
          selectedDestination={null}
        />
        <HostCreationToolListener />
      </div>
    </div>
  );
}
