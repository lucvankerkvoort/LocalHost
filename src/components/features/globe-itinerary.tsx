'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { 
  CityMarkerData,
  GlobeDestination, 
  PlaceMarkerData,
  RouteMarkerData,
  TravelRoute,
} from '@/types/globe';
import { ItineraryItem } from '@/types/itinerary';
import type { PlannerExperience } from '@/types/planner-experiences';

import { BookingDialog } from './booking-dialog';
import { PaymentModal } from './payment/payment-modal';
import { ItineraryDayColumn } from './itinerary-day';
import { HostPanel } from './host-panel';
import { buildAddedExperienceIds, buildBookedExperienceIds } from './host-panel-state';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  hydrateGlobeState,
  setDestinations,
  setSelectedDestination,
  clearItinerary,
  setHoveredItemId,
  setActiveItemId,
  setFocusedItemId,
  setVisualTarget,
  clearSelectedExperienceId,
  clearSelectedHostId,
  setSelectedExperienceId,
  setSelectedHostId,
  clearPlannerHosts,
  clearHostMarkers,
  setCameraHeight,
} from '@/store/globe-slice';
import { 
  fetchActiveTrip, 
  addExperienceToTrip, 
  removeExperienceFromTrip,
  fetchPlannerExperiencesByCity,
} from '@/store/globe-thunks';
import type { HostMarkerData } from '@/types/globe';
import {
  setItineraryCollapsed,
  setItineraryPanelTab,
  setShowTimeline,
} from '@/store/ui-slice';

// Dynamic import for Cesium (no SSR)
const CesiumGlobe = dynamic(() => import('./cesium-globe'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--deep-space-blue)]">
      <div className="text-white animate-pulse">Loading globe...</div>
    </div>
  ),
});

const ITINERARY_STATE_PREFIX = 'globe-itinerary-state:';
const ITINERARY_PENDING_KEY = 'globe-itinerary-pending';
const ITINERARY_RESTORE_PARAM = 'restoreKey';
const CITY_CLUSTER_DISTANCE_METERS = 60000;
const CITY_LEVEL_MAX_HEIGHT_METERS = 200000;

function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

type GlobeItinerarySnapshot = {
  destinations: GlobeDestination[];
  routes: TravelRoute[];
  routeMarkers: RouteMarkerData[];
  selectedDestination: string | null;
  visualTarget: { lat: number; lng: number; height?: number } | null;
  showTimeline: boolean;
  hostMarkers: HostMarkerData[];
  placeMarkers: PlaceMarkerData[];
  isItineraryCollapsed: boolean;
  itineraryPanelTab: 'ITINERARY' | 'EXPERIENCES';
  selectedHostId: string | null;
  selectedExperienceId: string | null;
};

type PlanningExperienceSelection = {
  hostId: string;
  hostName: string;
  hostLat?: number;
  hostLng?: number;
  hostCity?: string;
  experience: PlannerExperience;
};

type BookingCandidate = {
  id: string;
  hostId: string;
  experienceId: string;
  dayNumber?: number;
  date?: string | null;
  timeSlot?: string | null;
  experience: {
    id: string;
    title: string;
    price: number;
    duration: number;
    rating?: number;
    reviewCount?: number;
    photos?: string[];
  };
  host: {
    id: string;
    name: string;
    image?: string | null;
  };
  [key: string]: unknown;
};

type GlobeItineraryProps = {
  tripId?: string;
};

export default function GlobeItinerary({ tripId: propTripId }: GlobeItineraryProps) {
  const dispatch = useAppDispatch();
  const destinations = useAppSelector((state) => state.globe.destinations);
  const routes = useAppSelector((state) => state.globe.routes);
  const routeMarkers = useAppSelector((state) => state.globe.routeMarkers);
  const selectedDestination = useAppSelector((state) => state.globe.selectedDestination);
  const visualTarget = useAppSelector((state) => state.globe.visualTarget);
  const hostMarkers = useAppSelector((state) => state.globe.hostMarkers);
  const cameraHeight = useAppSelector((state) => state.globe.cameraHeight);
  const plannerHosts = useAppSelector((state) => state.globe.plannerHosts);
  const placeMarkers = useAppSelector((state) => state.globe.placeMarkers);
  const tripIdState = useAppSelector((state) => state.globe.tripId);
  const activeItemId = useAppSelector((state) => state.globe.activeItemId);
  const hoveredItemId = useAppSelector((state) => state.globe.hoveredItemId);
  const selectedHostId = useAppSelector((state) => state.globe.selectedHostId);
  const selectedExperienceId = useAppSelector((state) => state.globe.selectedExperienceId);
  const showTimeline = useAppSelector((state) => state.ui.showTimeline);
  const isCollapsed = useAppSelector((state) => state.ui.isItineraryCollapsed);
  const itineraryPanelTab = useAppSelector((state) => state.ui.itineraryPanelTab);

  // Use prop ID if available (priority), otherwise state ID
  
  useEffect(() => {
    dispatch(fetchActiveTrip(propTripId));

    return () => {
        dispatch(clearItinerary());
    };
  }, [dispatch, propTripId]);
  
  const tripId = propTripId || tripIdState; 

  const selectedDestData = useMemo(() => {
    if (!selectedDestination) return null;
    return destinations.find((d) => d.id === selectedDestination) || null;
  }, [selectedDestination, destinations]);

  const isCityZoom = useMemo(() => {
    if (cameraHeight === null) return false;
    return cameraHeight <= CITY_LEVEL_MAX_HEIGHT_METERS;
  }, [cameraHeight]);

  const shouldShowHostMarkers = isCityZoom && itineraryPanelTab === 'EXPERIENCES';
  const visibleHostMarkers = shouldShowHostMarkers ? hostMarkers : [];
  const visibleRouteMarkers = isCityZoom ? routeMarkers : [];

  const selectedCity = useMemo(() => {
    if (!selectedDestData) return '';
    const city = selectedDestData.city ?? selectedDestData.name ?? '';
    return city.trim();
  }, [selectedDestData]);

  const addedExperienceIds = useMemo(() => {
    return buildAddedExperienceIds(selectedDestData?.activities);
  }, [selectedDestData]);

  const bookedExperienceIds = useMemo(() => {
    return buildBookedExperienceIds(selectedDestData?.activities);
  }, [selectedDestData]);

  const router = useRouter();
  const searchParams = useSearchParams();
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    if (!selectedCity) {
      dispatch(clearPlannerHosts());
      dispatch(clearHostMarkers());
      return;
    }
    dispatch(fetchPlannerExperiencesByCity(selectedCity));
  }, [dispatch, selectedCity]);

  /* Persistence Logic - Chat state removed */
  const persistItineraryState = useCallback(() => {
    if (typeof window === 'undefined') return null;

    const snapshot: GlobeItinerarySnapshot = {
      destinations,
      routes,
      routeMarkers,
      selectedDestination,
      visualTarget,
      showTimeline,
      hostMarkers,
      placeMarkers,
      isItineraryCollapsed: isCollapsed,
      itineraryPanelTab,
      selectedHostId,
      selectedExperienceId,
    };

    const key = `${ITINERARY_STATE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      sessionStorage.setItem(key, JSON.stringify(snapshot));
      sessionStorage.setItem(ITINERARY_PENDING_KEY, key);
      return key;
    } catch (err) {
      console.warn('[GlobeItinerary] Failed to persist state', err);
      return null;
    }
  }, [
    destinations,
    routes,
    routeMarkers,
    selectedDestination,
    visualTarget,
    showTimeline,
    hostMarkers,
    placeMarkers,
    isCollapsed,
    itineraryPanelTab,
    selectedHostId,
    selectedExperienceId,
  ]);

  const restoreItineraryState = useCallback((restoreKey: string) => {
    if (typeof window === 'undefined') return false;

    const raw = sessionStorage.getItem(restoreKey);
    if (!raw) return false;

    try {
      const snapshot = JSON.parse(raw) as GlobeItinerarySnapshot;

      dispatch(
        hydrateGlobeState({
          destinations: snapshot.destinations ?? [],
          routes: snapshot.routes ?? [],
          routeMarkers: snapshot.routeMarkers ?? [],
          selectedDestination: snapshot.selectedDestination ?? null,
          visualTarget: snapshot.visualTarget ?? null,
          hostMarkers: snapshot.hostMarkers ?? [],
          placeMarkers: snapshot.placeMarkers ?? [],
        })
      );
      dispatch(setShowTimeline(snapshot.showTimeline ?? true));
      dispatch(setItineraryCollapsed(snapshot.isItineraryCollapsed ?? false));
      dispatch(setItineraryPanelTab(snapshot.itineraryPanelTab ?? 'ITINERARY'));
      dispatch(setSelectedHostId(snapshot.selectedHostId ?? null));
      dispatch(setSelectedExperienceId(snapshot.selectedExperienceId ?? null));

      return true;
    } catch (err) {
      console.warn('[GlobeItinerary] Failed to restore state', err);
      return false;
    }
  }, [dispatch]);

  const searchParamsString = searchParams.toString();

  useEffect(() => {
    if (hasRestoredRef.current) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(searchParamsString);
    const restoreKeyParam = params.get(ITINERARY_RESTORE_PARAM);
    const pendingKey = sessionStorage.getItem(ITINERARY_PENDING_KEY);
    const restoreKey = restoreKeyParam || pendingKey;

    if (!restoreKey) return;

    hasRestoredRef.current = true;
      restoreItineraryState(restoreKey);
    sessionStorage.removeItem(ITINERARY_PENDING_KEY);
    sessionStorage.removeItem(restoreKey);

    if (restoreKeyParam) {
      params.delete(ITINERARY_RESTORE_PARAM);
      const nextQuery = params.toString();
      router.replace(nextQuery ? `/?${nextQuery}` : '/');
    }

  }, [restoreItineraryState, router, searchParamsString]);

  // Scroll Sync Logic
  const listRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleListScroll = useCallback(() => {
    if (scrollTimeoutRef.current) return;

    scrollTimeoutRef.current = setTimeout(() => {
      scrollTimeoutRef.current = null;
      
      if (!listRef.current) return;
      
      const rect = listRef.current.getBoundingClientRect();
      const midY = rect.top + rect.height / 3; // Focus closer to top third like a timeline
      const x = rect.left + 50; // Inset slightly
      
      const elements = document.elementsFromPoint(x, midY);
      // Find the specific item card
      const itemEl = elements.find(el => el.hasAttribute('data-item-id'));
      
      if (itemEl) {
        const itemId = itemEl.getAttribute('data-item-id');
        if (itemId) {
            dispatch(setFocusedItemId(itemId));
        }
      }
    }, 100); // 100ms throttle
  }, [dispatch]);

  // Booking State
  const [bookingDialogState, setBookingDialogState] = useState<{
    isOpen: boolean;
    candidate: BookingCandidate | null;
  }>({ isOpen: false, candidate: null });

  const [paymentModalState, setPaymentModalState] = useState<{
    isOpen: boolean;
    bookingId: string;
  }>({ isOpen: false, bookingId: '' });

  const handleViewHostProfile = useCallback((host: HostMarkerData) => {
    const restoreKey = persistItineraryState();
    const returnTo = restoreKey
      ? `/?${ITINERARY_RESTORE_PARAM}=${encodeURIComponent(restoreKey)}`
      : '/';
    const hostId = host.hostId || host.id;
    router.push(`/hosts/${hostId}?returnTo=${encodeURIComponent(returnTo)}`);
  }, [persistItineraryState, router]);

  const handleMapBackgroundClick = useCallback(() => {
    dispatch(clearSelectedHostId());
    dispatch(clearSelectedExperienceId());
    dispatch(setActiveItemId(null));
  }, [dispatch]);

  const handleAddExperience = useCallback((selection: PlanningExperienceSelection) => {
    const { experience } = selection;
    dispatch(setSelectedExperienceId(experience.id));
    dispatch(setShowTimeline(true));
    dispatch(setItineraryCollapsed(false));

    if (bookedExperienceIds.has(experience.id)) {
      return;
    }

    if (!selectedDestData) {
      console.warn('[GlobeItinerary] Cannot add experience: No selected day');
      return;
    }

    const hostPayload = {
      id: selection.hostId,
      name: selection.hostName,
      city: selection.hostCity ?? selectedDestData.city ?? selectedDestData.name,
      lat: selection.hostLat ?? selectedDestData.lat,
      lng: selection.hostLng ?? selectedDestData.lng,
    };

    if (addedExperienceIds.has(experience.id)) {
      const itemToRemove = selectedDestData.activities.find(
        (item) => item.experienceId === experience.id
      );

      if (itemToRemove && tripId) {
        dispatch(removeExperienceFromTrip({ tripId, itemId: itemToRemove.id }));
      } else {
        console.warn('Cannot remove: item not found or missing tripId');
      }
      return;
    }

    if (!selectedDestination) {
      console.warn('[GlobeItinerary] Cannot add experience: Missing selected destination');
      return;
    }

    dispatch(
      addExperienceToTrip({
        tripId: tripId || null,
        dayId: selectedDestData.id,
        dayNumber: selectedDestData.day || 1,
        experience,
        host: hostPayload,
      })
    )
      .unwrap()
      .then((result: { local?: boolean; booking?: { id: string } } | undefined) => {
        if (result?.local) return;
        if (result && result.booking) {
          console.log('Experience added, booking created:', result.booking.id);
        }
      })
      .catch((err) => {
        console.error('Failed to add experience:', err);
      });
  }, [
    addedExperienceIds,
    bookedExperienceIds,
    dispatch,
    selectedDestData,
    selectedDestination,
    tripId,
  ]);

  // Booking Handler
  const handleBookItem = async (dayId: string, item: ItineraryItem) => {
    console.log('[GlobeItinerary] handleBookItem called', { dayId, item, tripId });
    
    // Validate Item Type (Handle 'EXPERIENCE' type)
    const isLocalhostType = item.type === 'EXPERIENCE';
    
    if (!isLocalhostType || !item.hostId) {
      console.warn('[GlobeItinerary] Item validation failed:', { 
          type: item.type, 
          hostId: item.hostId, 
          expId: item.experienceId,
          isLocalhostType
      });
      return;
    }

    // GUEST CHECK: If no tripId, we are in local/guest mode
    if (!tripId) {
        const confirmSave = window.confirm("You need to save your itinerary and sign in to book this experience. Would you like to save now?");
        if (confirmSave) {
            window.location.href = '/auth/signin?callbackUrl=/'; 
        }
        return;
    }

    try {
      let candidateId = item.candidateId;
      let candidateData: BookingCandidate | null = null;

      // If no candidate yet, create one
      if (!candidateId) {
        const dest = destinations.find(d => d.id === dayId);
        if (!dest) {
             console.error('[GlobeItinerary] Day not found:', dayId);
             return;
        }

        console.log('[GlobeItinerary] Creating candidate via API...');
        // Call API to create candidate
        const res = await fetch('/api/itinerary/candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tripId, // Add tripId
            hostId: item.hostId,
            experienceId: item.experienceId,
            itemId: item.id,
            dayId, // Add dayId explicitly
            dayNumber: dest.day,
            date: null,
            timeSlot: null,
            // Pass experience details for on-the-fly creation if needed
            experienceData: {
              title: item.title,
              description: item.description || '',
              price: 5000, // Default price in cents
              city: dest.name,
              lat: item.place?.location?.lat,
              lng: item.place?.location?.lng,
            }
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error('[GlobeItinerary] API Error:', res.status, errorText);
          throw new Error('Failed to create booking candidate: ' + errorText);
        }

        const data = (await res.json()) as { candidate?: BookingCandidate };
        console.log('[GlobeItinerary] Candidate created:', data);
        candidateData = data.candidate || null;
        if (!candidateData) {
          throw new Error('Booking candidate was not returned by API');
        }
        candidateId = candidateData.id;

        // Update item with candidateId
        const updatedDestinations = destinations.map(d => {
            if (d.id === dayId) {
                return {
                    ...d,
                    activities: d.activities.map(i => 
                        i.id === item.id ? { ...i, candidateId: candidateId, status: 'PENDING' as const } : i
                    )
                };
            }
            return d;
        });
        
        dispatch(setDestinations(updatedDestinations));
      } else {
        console.log('[GlobeItinerary] Fetching existing candidate:', candidateId);
        const params = new URLSearchParams();
        params.set('candidateId', candidateId);
        if (tripId) {
          params.set('tripId', tripId);
        }
        const res = await fetch(`/api/itinerary/candidates?${params.toString()}`);
        const data = (await res.json()) as { candidates?: BookingCandidate[] };
        candidateData = data.candidates?.find((candidate) => candidate.id === candidateId) || null;
      }

      if (candidateData) {
        console.log('[GlobeItinerary] Opening Booking Dialog with:', candidateData);
        setBookingDialogState({
          isOpen: true,
          candidate: candidateData,
        });
      } else {
          console.error('[GlobeItinerary] No candidate data found after operations.');
      }

    } catch (error) {
      console.error('Booking flow error:', error);
      // Check if it's a "not found" error for mock experiences
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('Experience not found') || errorMessage.includes('404')) {
        alert('This experience is a demo preview and cannot be booked yet. Try booking one of the featured experiences!');
      } else {
        alert('Failed to start booking flow. Please try again.');
      }
    }
  };

  const handleConfirmBooking = async (candidateId: string) => {
    console.log('[GlobeItinerary] Confirming booking via candidate (which IS a booking):', candidateId);
    // Candidate IS the booking in TENTATIVE status - no need to call /api/bookings
    // Just open the payment modal with the candidateId (which is the bookingId)
    setBookingDialogState({ isOpen: false, candidate: null });
    setPaymentModalState({ isOpen: true, bookingId: candidateId });
  };

  type BookingProjection = {
    id: string;
    status: string;
  };

  type TripProjection = {
    stops?: Array<{
      days?: Array<{
        items?: Array<{
          bookings?: BookingProjection[];
        }>;
      }>;
    }>;
  };

  const isBookingProjectedAsBooked = (trip: TripProjection | null | undefined, bookingId: string): boolean => {
    if (!trip?.stops?.length) return false;

    return trip.stops.some((stop) =>
      stop.days?.some((day) =>
        day.items?.some((item) =>
          item.bookings?.some((booking) =>
            booking.id === bookingId &&
            (booking.status === 'CONFIRMED' || booking.status === 'COMPLETED')
          )
        )
      )
    );
  };

  const waitForBookedProjection = async (bookingId: string): Promise<boolean> => {
    if (!tripId) return false;

    const maxAttempts = 6;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const trip = await dispatch(fetchActiveTrip(tripId)).unwrap();
        if (isBookingProjectedAsBooked(trip, bookingId)) {
          return true;
        }
      } catch (error) {
        console.warn('[GlobeItinerary] Failed to refresh trip after payment success', error);
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    return false;
  };

  const handlePaymentSuccess = async () => {
      const bookingId = paymentModalState.bookingId;
      setPaymentModalState({ isOpen: false, bookingId: '' });

      if (!tripId) {
        alert('Payment Successful!');
        return;
      }

      const confirmed = bookingId ? await waitForBookedProjection(bookingId) : false;

      if (confirmed) {
        alert('Payment Successful!');
        return;
      }

      await dispatch(fetchActiveTrip(tripId));
      alert('Payment submitted. Booking confirmation may take a few seconds to appear.');
  };

  const cityMarkers = useMemo<CityMarkerData[]>(() => {
    if (destinations.length === 0) return [];

    type CityCluster = CityMarkerData & {
      minDay: number;
    };

    const clusters: CityCluster[] = [];
    const byCityKey = new Map<string, CityCluster>();
    const unassigned: GlobeDestination[] = [];

    const buildMarkerId = (name: string, index: number) => {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      return slug ? `city-${slug}` : `city-${index + 1}`;
    };

    const createCluster = (name: string, dest: GlobeDestination) => {
      const cluster: CityCluster = {
        id: buildMarkerId(name, clusters.length),
        name,
        lat: dest.lat,
        lng: dest.lng,
        dayIds: [dest.id],
        dayNumbers: [dest.day],
        color: dest.color,
        minDay: dest.day,
      };
      clusters.push(cluster);
      return cluster;
    };

    const addToCluster = (cluster: CityCluster, dest: GlobeDestination) => {
      cluster.dayIds.push(dest.id);
      cluster.dayNumbers.push(dest.day);
      // Keep first day's position as canonical — don't average/drift
      if (dest.day < cluster.minDay) {
        cluster.minDay = dest.day;
        cluster.color = dest.color;
      }
    };

    const sortedDestinations = [...destinations].sort((a, b) => a.day - b.day);

    for (const dest of sortedDestinations) {
      const cityName = dest.city?.trim();
      if (cityName) {
        const key = cityName.toLowerCase();
        const existing = byCityKey.get(key);
        if (existing) {
          addToCluster(existing, dest);
        } else {
          const cluster = createCluster(cityName, dest);
          byCityKey.set(key, cluster);
        }
      } else {
        unassigned.push(dest);
      }
    }

    for (const dest of unassigned) {
      let closest: CityCluster | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (const cluster of clusters) {
        const distance = calculateDistanceMeters(dest.lat, dest.lng, cluster.lat, cluster.lng);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = cluster;
        }
      }

      if (closest && closestDistance <= CITY_CLUSTER_DISTANCE_METERS) {
        addToCluster(closest, dest);
      } else {
        createCluster(dest.name || `Stop ${dest.day}`, dest);
      }
    }

    return clusters
      .map((cluster) => ({
        id: cluster.id,
        name: cluster.name,
        lat: cluster.lat,
        lng: cluster.lng,
        dayIds: cluster.dayIds,
        dayNumbers: [...cluster.dayNumbers].sort((a, b) => a - b),
        color: cluster.color,
      }))
      .sort((a, b) => (a.dayNumbers[0] ?? 0) - (b.dayNumbers[0] ?? 0));
  }, [destinations]);

  const handleCityMarkerClick = useCallback((marker: CityMarkerData) => {
    if (marker.dayIds.length === 0) return;
    if (selectedDestination && marker.dayIds.includes(selectedDestination)) {
      return;
    }

    const nextDay = destinations
      .filter((dest) => marker.dayIds.includes(dest.id))
      .sort((a, b) => a.day - b.day)[0];

    dispatch(setSelectedDestination(nextDay?.id ?? marker.dayIds[0]));
    dispatch(clearSelectedHostId());
  }, [destinations, dispatch, selectedDestination]);

  const orderedDestinations = useMemo(
    () => [...destinations].sort((a, b) => a.day - b.day),
    [destinations]
  );

  const findHostMarker = useCallback((hostId: string): HostMarkerData | null => {
    return hostMarkers.find((host) => host.id === hostId || host.hostId === hostId) ?? null;
  }, [hostMarkers]);

  const handleHostSelection = useCallback((host: HostMarkerData) => {
    dispatch(setSelectedHostId(host.hostId || host.id));
    dispatch(clearSelectedExperienceId());
    dispatch(setItineraryPanelTab('EXPERIENCES'));
    dispatch(setShowTimeline(true));
    dispatch(setItineraryCollapsed(false));
  }, [dispatch]);

  const handleFocusExperience = useCallback((selection: PlanningExperienceSelection) => {
    const hostMarker = findHostMarker(selection.hostId);
    dispatch(setSelectedHostId(selection.hostId));
    dispatch(setSelectedExperienceId(selection.experience.id));

    const focusLat = selection.hostLat ?? hostMarker?.lat ?? selectedDestData?.lat;
    const focusLng = selection.hostLng ?? hostMarker?.lng ?? selectedDestData?.lng;

    if (typeof focusLat === 'number' && typeof focusLng === 'number') {
      dispatch(setVisualTarget({ lat: focusLat, lng: focusLng, height: 5000 }));
    }
  }, [dispatch, findHostMarker, selectedDestData?.lat, selectedDestData?.lng]);

  // --- List <-> Globe Sync Handlers ---
  
  const handleItemHover = useCallback((itemId: string | null) => {
    dispatch(setHoveredItemId(itemId));
  }, [dispatch]);

  const handleItemClick = useCallback((itemId: string, dayId: string, lat?: number, lng?: number) => {
    dispatch(setActiveItemId(itemId));
    
    // Select the day this item belongs to
    if (dayId !== selectedDestination) {
      dispatch(setSelectedDestination(dayId));
    }

    // Fly to location if coordinates exist
    if (lat && lng) {
      dispatch(setVisualTarget({ lat, lng, height: 5000 }));
    }
  }, [dispatch, selectedDestination]);

  const handleDaySelect = useCallback((dayId: string) => {
    dispatch(setSelectedDestination(dayId));
    dispatch(setActiveItemId(null)); // Clear specific item selection when selecting a day
    
    const dest = destinations.find(d => d.id === dayId);
    if (dest) {
        dispatch(setVisualTarget({ lat: dest.lat, lng: dest.lng, height: 50000 }));
    }
  }, [dispatch, destinations]);

  const handleAddActivity = useCallback((dayId: string) => {
    handleDaySelect(dayId);
    dispatch(setItineraryPanelTab('EXPERIENCES'));
    dispatch(setShowTimeline(true));
    dispatch(setItineraryCollapsed(false));
  }, [dispatch, handleDaySelect]);

  useEffect(() => {
    if (selectedDestination || destinations.length === 0) return;
    dispatch(setSelectedDestination(destinations[0].id));
  }, [destinations, dispatch, selectedDestination]);

  return (
    <div
      className="h-full w-full flex flex-col bg-[var(--deep-space-blue)]"
      data-itinerary-panel-tab={itineraryPanelTab}
      data-selected-host-id={selectedHostId || ''}
      data-selected-experience-id={selectedExperienceId || ''}
    >
      {/* Floating Map Controls */}
      {/* Floating Map Controls - Removed as per request */}
      <div className="absolute top-20 right-4 z-20 flex flex-col gap-2 pointer-events-none">
          {/* Empty container */}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Globe */}
        <div data-testid="globe-container" className="flex-1 relative">
          <CesiumGlobe
            destinations={destinations}
            cityMarkers={cityMarkers}
            routeMarkers={visibleRouteMarkers}
            hostMarkers={visibleHostMarkers}
            placeMarkers={placeMarkers}
            selectedDestination={selectedDestination}
            onCityMarkerClick={handleCityMarkerClick}
            onHostClick={handleHostSelection}
            onMapBackgroundClick={handleMapBackgroundClick}
            visualTarget={visualTarget}
            activeItemId={activeItemId}
            hoveredItemId={hoveredItemId}
            onItemHover={handleItemHover}
            onZoomChange={(height) => dispatch(setCameraHeight(height))}
          />
          {/* Itinerary Panel / Mobile Drawer */}
          <div
            data-testid="itinerary-panel"
            className={`z-10 transition-all duration-300 ease-in-out flex flex-col border-white/10 bg-[rgba(12,16,24,0.2)] backdrop-blur-[6px] ${
              showTimeline && destinations.length > 0
                ? 'fixed inset-x-0 bottom-0 top-16 border-t md:absolute md:inset-auto md:top-0 md:left-0 md:bottom-0 md:border-t-0 md:border-r'
                : 'pointer-events-none translate-y-full md:-translate-x-full'
            } ${isCollapsed ? 'md:w-[60px]' : 'md:w-[360px]'} `}
          >
            {/* Header / Tabs */}
            <div className="px-4 pt-3 pb-2 border-b border-white/10 sticky top-0 z-20 bg-[rgba(12,16,24,0.45)] backdrop-blur-[8px]">
              {isCollapsed ? (
                <div className="hidden md:flex items-center justify-center">
                  <button
                    onClick={() => dispatch(setItineraryCollapsed(false))}
                    className="p-1 hover:bg-white/10 rounded-md text-white/70 transition-colors"
                    aria-label="Expand itinerary panel"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <span className="text-[var(--princeton-orange)]">●</span> Planner
                    </h2>
                    <div className="hidden md:flex items-center gap-2">
                      <div className="text-xs text-[var(--muted-foreground)]">{destinations.length} Days</div>
                      <button
                        onClick={() => dispatch(setItineraryCollapsed(true))}
                        className="p-1 hover:bg-white/10 rounded-md text-white/70 transition-colors"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2" data-testid="itinerary-panel-tabs">
                    <button
                      onClick={() => dispatch(setItineraryPanelTab('ITINERARY'))}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        itineraryPanelTab === 'ITINERARY'
                          ? 'bg-[var(--princeton-orange)] text-white'
                          : 'bg-white/5 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      Itinerary
                    </button>
                    <button
                      data-testid="open-experiences-tab"
                      onClick={() => dispatch(setItineraryPanelTab('EXPERIENCES'))}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        itineraryPanelTab === 'EXPERIENCES'
                          ? 'bg-[var(--princeton-orange)] text-white'
                          : 'bg-white/5 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      Experiences
                    </button>
                  </div>
                </>
              )}
            </div>

            {isCollapsed ? null : itineraryPanelTab === 'ITINERARY' ? (
              <div
                className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent p-4 space-y-8"
                ref={listRef}
                onScroll={handleListScroll}
              >
                {orderedDestinations.length === 0 ? (
                  <div className="text-center text-[var(--muted-foreground)] py-12">
                    <p>No destinations yet.</p>
                  </div>
                ) : (
                  orderedDestinations.map((day) => (
                    <ItineraryDayColumn
                      key={day.id}
                      dayId={day.id}
                      dayNumber={day.day}
                      title={day.name}
                      city={day.city}
                      date={day.date}
                      activities={day.activities}
                      isActive={day.id === selectedDestination}
                      onSelect={() => handleDaySelect(day.id)}
                      onAddActivity={(dayId) => handleAddActivity(dayId)}
                      onItemClick={(item) =>
                        handleItemClick(
                          item.id,
                          day.id,
                          item.place?.location?.lat,
                          item.place?.location?.lng
                        )
                      }
                      onItemHover={(itemId) => handleItemHover(itemId)}
                      onBookItem={(item) => handleBookItem(day.id, item)}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col p-3 gap-3">
                {/* Desktop day chips */}
                <div className="hidden sm:flex gap-2 overflow-x-auto pb-1">
                  {orderedDestinations.map((day) => (
                    <button
                      key={day.id}
                      onClick={() => handleDaySelect(day.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                        selectedDestination === day.id
                          ? 'bg-[var(--princeton-orange)] text-white'
                          : 'bg-white/10 text-white/80 hover:bg-white/15'
                      }`}
                    >
                      Day {day.day}
                    </button>
                  ))}
                </div>

                {/* Mobile day dropdown */}
                <div className="sm:hidden">
                  <label className="text-xs text-white/70 mb-1 block">Add to day</label>
                  <select
                    value={selectedDestination ?? ''}
                    onChange={(event) => handleDaySelect(event.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-[rgba(10,14,22,0.8)] text-white text-sm px-3 py-2"
                  >
                    {orderedDestinations.map((day) => (
                      <option key={day.id} value={day.id}>
                        Day {day.day}: {day.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex-1 min-h-0">
                  <HostPanel
                    variant="panel"
                    hosts={plannerHosts}
                    hostMarkers={hostMarkers}
                    selectedHostId={selectedHostId}
                    selectedDayNumber={selectedDestData?.day}
                    addedExperienceIds={addedExperienceIds}
                    bookedExperienceIds={bookedExperienceIds}
                    onHostClick={handleHostSelection}
                    onFocusExperience={(host, experience, marker) => {
                      handleFocusExperience({
                        hostId: host.id,
                        hostName: host.name,
                        hostCity: host.city ?? undefined,
                        hostLat: marker?.lat,
                        hostLng: marker?.lng,
                        experience,
                      });
                    }}
                    onViewProfile={handleViewHostProfile}
                    onAddExperience={(host, experience, marker) => {
                      if (!selectedDestination) {
                        alert('Please select a day on the map first!');
                        return;
                      }
                      handleAddExperience({
                        hostId: host.id,
                        hostName: host.name,
                        hostCity: host.city ?? undefined,
                        hostLat: marker?.lat,
                        hostLng: marker?.lng,
                        experience,
                      });
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Booking Dialog */}
      {bookingDialogState.candidate && (
        <BookingDialog
          candidate={bookingDialogState.candidate}
          isOpen={bookingDialogState.isOpen}
          onClose={() => setBookingDialogState({ ...bookingDialogState, isOpen: false })}
          onConfirm={handleConfirmBooking}
        />
      )}

      <PaymentModal
        isOpen={paymentModalState.isOpen}
        bookingId={paymentModalState.bookingId}
        onClose={() => setPaymentModalState({ isOpen: false, bookingId: '' })}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}
