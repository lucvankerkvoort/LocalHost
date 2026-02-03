'use client';

import { useEffect, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { selectHostCreation, setDraft } from '@/store/host-creation-slice';
import { SummaryPanel } from '@/components/features/host-creation/summary-panel';
import HostCreationMap from '@/components/features/host-creation/host-creation-map';
import { HostCreationToolListener } from '@/components/features/host-creation/tool-listener';
import { PlaceMarkerData } from '@/types/globe';
import { saveExperienceDraft } from '@/actions/experiences';
import { useDebounce } from '@/hooks/use-debounce';

interface EditorLayoutProps {
  draftId?: string;
  initialData?: any; 
}

export function EditorLayout({ draftId, initialData }: EditorLayoutProps) {
  const dispatch = useAppDispatch();
  const hostCreationState = useAppSelector(selectHostCreation);
  const { stops, cityLat, cityLng } = hostCreationState;

  // 1. Restore last active draft on load
  const isInitialized = useRef(false);
  useEffect(() => {
    if (!isInitialized.current && initialData) {
      // Map Prisma data to Redux slice shape
      // This requires ensuring initialData matches what setDraft expects
      // Or we can manually dispatch partial updates
      // For MVP, assuming initialData (ExperienceDraft) has similar shape or we adapt it
      dispatch(setDraft({
        draftId: draftId ?? null,
        stops: initialData.stops || [],
        city: initialData.city,
        cityLat: initialData.cityLat,
        cityLng: initialData.cityLng,
        title: initialData.title,
        shortDesc: initialData.shortDesc,
        longDesc: initialData.longDesc,
        duration: initialData.duration,
        status: initialData.status,
      }));
      isInitialized.current = true;
    }
  }, [initialData, dispatch]);

  // 2. Debounce state for auto-save
  const debouncedState = useDebounce(hostCreationState, 2000);

  // 3. Auto-save effect
  useEffect(() => {
    if (!draftId || !isInitialized.current) return;

    const save = async () => {
      await saveExperienceDraft(draftId, {
        title: debouncedState.title || undefined,
        shortDesc: debouncedState.shortDesc || undefined,
        longDesc: debouncedState.longDesc || undefined,
        city: debouncedState.city || undefined,
        cityLat: debouncedState.cityLat || undefined,
        cityLng: debouncedState.cityLng || undefined,
        duration: debouncedState.duration || undefined,
        sections: {
           stops: debouncedState.stops
        },
        stops: debouncedState.stops,
        price: undefined, // Add to Redux if needed
        currency: undefined, 
      });
    };
    save();
  }, [debouncedState, draftId]);

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
        <SummaryPanel draftId={draftId} />
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
