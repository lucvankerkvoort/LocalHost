'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Pause, Play, Square } from 'lucide-react';
import { 
  CityMarkerData,
  GlobeDestination, 
  PlaceMarkerData,
  RouteMarkerData,
  TravelRoute,
} from '@/types/globe';
import { ItineraryItem } from '@/types/itinerary';
import type { PlannerExperience } from '@/types/planner-experiences';
import { buildPlaceImageListUrl, PLACE_IMAGE_FALLBACK } from '@/lib/images/places';

import { BookingDialog } from './booking-dialog';
import { PaymentModal } from './payment/payment-modal';
import { ItineraryDayColumn } from './itinerary-day';
import { HostPanel } from './host-panel';
import { buildAddedExperienceIds, buildBookedExperienceIds } from './host-panel-state';
import { buildPlannerExperienceStopMarkers } from './globe-itinerary-utils';
import { OrchestratorJobStatus } from './orchestrator-job-status';
import { deriveOrchestratorProgressUi } from './orchestrator-progress-ui';
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
  setP2PChatOpen,
  setShowTimeline,
} from '@/store/ui-slice';
import { initThread } from '@/store/p2p-chat-slice';

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
const TOUR_STEP_MS = 3000;
const SHOW_TOUR_CONTROLS = false;

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
  hostPhoto?: string;
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

type ItemPreviewImage = {
  url: string;
  attribution?: {
    displayName?: string;
    uri?: string;
  };
};

type ItineraryItemPreview = {
  itemId: string;
  title: string;
  description?: string;
  lat: number;
  lng: number;
  images: ItemPreviewImage[];
  isLoading: boolean;
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

  const orchestratorJob = useAppSelector((state) => {
    const activeId = state.orchestrator.activeJobId;
    return activeId ? state.orchestrator.jobs[activeId] : null;
  });
  
  const isSyncing = useMemo(() => {
    if (!orchestratorJob) return false;
    const isVisualReady = destinations.length > 0;
    const ui = deriveOrchestratorProgressUi(orchestratorJob, undefined, isVisualReady);
    return ui.displayState === 'visual_ready_syncing';
  }, [orchestratorJob, destinations.length]);
  const [itemPreview, setItemPreview] = useState<ItineraryItemPreview | null>(null);
  const imageCacheRef = useRef<Map<string, ItemPreviewImage[]>>(new Map());
  const [tourState, setTourState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [tourIndex, setTourIndex] = useState(0);
  const tourTimerRef = useRef<number | null>(null);

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

  const experienceStopMarkers = useMemo<PlaceMarkerData[]>(() => {
    return buildPlannerExperienceStopMarkers(
      plannerHosts,
      selectedHostId,
      selectedExperienceId
    );
  }, [plannerHosts, selectedExperienceId, selectedHostId]);

  const orderedActivities = useMemo(() => {
    if (destinations.length === 0) return [];
    const sortedDays = [...destinations].sort((a, b) => a.day - b.day);
    const list: Array<{ item: ItineraryItem; dayId: string }> = [];

    sortedDays.forEach((day) => {
      const sortedItems = [...day.activities].sort((a, b) => a.position - b.position);
      sortedItems.forEach((item) => {
        const lat = item.place?.location?.lat;
        const lng = item.place?.location?.lng;
        if (typeof lat === 'number' && typeof lng === 'number') {
          list.push({ item, dayId: day.id });
        }
      });
    });

    return list;
  }, [destinations]);

  const clearTourTimer = useCallback(() => {
    if (tourTimerRef.current) {
      window.clearTimeout(tourTimerRef.current);
      tourTimerRef.current = null;
    }
  }, []);

  const stopTour = useCallback(() => {
    clearTourTimer();
    setTourState('idle');
    setTourIndex(0);
    dispatch(setActiveItemId(null));
    setItemPreview(null);
  }, [clearTourTimer, dispatch]);

  const pauseTour = useCallback(() => {
    clearTourTimer();
    setTourState('paused');
  }, [clearTourTimer]);

  const effectivePlaceMarkers = useMemo(() => {
    if (itineraryPanelTab !== 'EXPERIENCES') return placeMarkers;
    if (experienceStopMarkers.length === 0) return placeMarkers;
    return [...placeMarkers, ...experienceStopMarkers];
  }, [experienceStopMarkers, itineraryPanelTab, placeMarkers]);

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
    hostId: string;
    hostName: string;
    hostPhoto: string;
  }>({ isOpen: false, bookingId: '', hostId: '', hostName: '', hostPhoto: '' });

  const handleViewHostProfile = useCallback((host: HostMarkerData) => {
    const restoreKey = persistItineraryState();
    const returnTo = restoreKey
      ? `/?${ITINERARY_RESTORE_PARAM}=${encodeURIComponent(restoreKey)}`
      : '/';
    const hostId = host.hostId || host.id;
    router.push(`/hosts/${hostId}?returnTo=${encodeURIComponent(returnTo)}`);
  }, [persistItineraryState, router]);

  const handleMapBackgroundClick = useCallback(() => {
    if (tourState === 'playing') {
      pauseTour();
    }
    dispatch(clearSelectedHostId());
    dispatch(clearSelectedExperienceId());
    dispatch(setActiveItemId(null));
    setItemPreview(null);
  }, [dispatch, pauseTour, tourState]);

  const handleAddExperience = useCallback((selection: PlanningExperienceSelection) => {
    const { experience } = selection;
    dispatch(setSelectedHostId(selection.hostId));
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

  const openChatThread = useCallback(async (participantId: string, bookingId?: string) => {
    const res = await fetch('/api/chat/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantId,
        bookingId,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to open host chat: ${res.status} ${errorText}`);
    }

    const data = (await res.json()) as {
      thread?: {
        id: string;
        bookingId: string | null;
        counterpartId: string;
        counterpartName: string;
        counterpartPhoto: string;
      };
    };
    if (!data.thread) {
      throw new Error('Thread payload was not returned while opening chat');
    }

    return data.thread;
  }, []);

  const handleChatExperience = useCallback(async (selection: PlanningExperienceSelection) => {
    dispatch(setSelectedHostId(selection.hostId));
    dispatch(setSelectedExperienceId(selection.experience.id));
    const thread = await openChatThread(selection.hostId);

    dispatch(
      initThread({
        threadId: thread.id,
        bookingId: thread.bookingId,
        hostId: thread.counterpartId,
        hostName: thread.counterpartName,
        hostPhoto: thread.counterpartPhoto || '/placeholder-host.jpg',
      })
    );
    dispatch(setP2PChatOpen(true));
  }, [dispatch, openChatThread]);

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
    const candidate = bookingDialogState.candidate;
    setBookingDialogState({ isOpen: false, candidate: null });
    setPaymentModalState({
      isOpen: true,
      bookingId: candidateId,
      hostId: candidate?.host?.id ?? '',
      hostName: candidate?.host?.name ?? 'Host',
      hostPhoto: candidate?.host?.image ?? '/placeholder-host.jpg',
    });
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
        const reconcileRes = await fetch(`/api/bookings/${bookingId}/reconcile`, { method: 'POST' });
        if (reconcileRes.ok) {
          const reconcileData = (await reconcileRes.json()) as { state?: string };
          if (reconcileData.state === 'CONFIRMED') {
            return true;
          }
          if (reconcileData.state === 'FAILED') {
            return false;
          }
        } else {
          const errorText = await reconcileRes.text();
          console.warn(
            `[GlobeItinerary] Reconcile request failed while waiting (${reconcileRes.status}):`,
            errorText
          );
        }
      } catch (error) {
        console.warn('[GlobeItinerary] Failed to reconcile payment while waiting for projection', error);
      }

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
      const { bookingId, hostId, hostName, hostPhoto } = paymentModalState;
      setPaymentModalState({ isOpen: false, bookingId: '', hostId: '', hostName: '', hostPhoto: '' });

      if (!tripId) {
        alert('Payment Successful!');
        return;
      }

      if (bookingId) {
        try {
          const reconcileRes = await fetch(`/api/bookings/${bookingId}/reconcile`, { method: 'POST' });
          if (reconcileRes.ok) {
            const reconcileData = (await reconcileRes.json()) as { state?: string };
            if (reconcileData.state === 'CONFIRMED') {
              await dispatch(fetchActiveTrip(tripId));
              if (hostId) {
                const thread = await openChatThread(hostId, bookingId);
                dispatch(
                  initThread({
                    threadId: thread.id,
                    bookingId: thread.bookingId,
                    hostId: thread.counterpartId,
                    hostName: thread.counterpartName || hostName,
                    hostPhoto: thread.counterpartPhoto || hostPhoto,
                  })
                );
                dispatch(setP2PChatOpen(true));
              }
              alert('Payment Successful!');
              return;
            }
            if (reconcileData.state === 'FAILED') {
              alert('Payment failed. Please try another payment method.');
              return;
            }
          } else {
            const errorText = await reconcileRes.text();
            console.warn(
              `[GlobeItinerary] Reconcile request failed after payment (${reconcileRes.status}):`,
              errorText
            );
          }
        } catch (error) {
          console.warn('[GlobeItinerary] Payment reconcile request failed', error);
        }
      }

      const confirmed = bookingId ? await waitForBookedProjection(bookingId) : false;

      if (confirmed) {
        await dispatch(fetchActiveTrip(tripId));
        if (bookingId && hostId) {
          const thread = await openChatThread(hostId, bookingId);
          dispatch(
            initThread({
              threadId: thread.id,
              bookingId: thread.bookingId,
              hostId: thread.counterpartId,
              hostName: thread.counterpartName || hostName,
              hostPhoto: thread.counterpartPhoto || hostPhoto,
            })
          );
          dispatch(setP2PChatOpen(true));
        }
        alert('Payment Successful!');
        return;
      }

      await dispatch(fetchActiveTrip(tripId));
      alert('Payment submitted. Booking confirmation may take a few seconds to appear. If it does not update, refresh the page and retry.');
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

  const resolveItemDescription = useCallback((item: ItineraryItem) => {
    const primary = item.description?.trim();
    if (primary) return primary;
    const secondary = item.place?.description?.trim();
    if (secondary) return secondary;
    const tertiary = item.location?.trim();
    return tertiary || undefined;
  }, []);

  const handleItemClick = useCallback(async (item: ItineraryItem, dayId: string, source: 'user' | 'tour' = 'user') => {
    if (tourState === 'playing' && source === 'user') {
      pauseTour();
    }
    dispatch(setActiveItemId(item.id));
    
    // Select the day this item belongs to
    if (dayId !== selectedDestination) {
      dispatch(setSelectedDestination(dayId));
    }

    // Fly to location if coordinates exist
    const lat = item.place?.location?.lat;
    const lng = item.place?.location?.lng;
      if (typeof lat === 'number' && typeof lng === 'number') {
        dispatch(setVisualTarget({ lat, lng, height: 5000 }));

        const cachedImages = imageCacheRef.current.get(item.id);
        const preloadedImages = Array.isArray(item.place?.imageUrls)
          ? item.place.imageUrls.map((url) => ({ url }))
          : null;
        setItemPreview({
          itemId: item.id,
          title: item.title,
          description: resolveItemDescription(item),
          lat,
          lng,
          images:
            cachedImages
            ?? preloadedImages
            ?? (item.place?.imageUrl ? [{ url: item.place.imageUrl }] : []),
          isLoading: !cachedImages && !preloadedImages,
        });

        if (!cachedImages && !preloadedImages) {
          const listUrl = buildPlaceImageListUrl({
            name: item.place?.name ?? item.title,
            city: item.place?.city,
            category: item.category ?? item.type,
            placeId: item.place?.id,
            count: 5,
          });

        if (!listUrl) {
          setItemPreview((prev) =>
            prev?.itemId === item.id
              ? { ...prev, images: [{ url: PLACE_IMAGE_FALLBACK }], isLoading: false }
              : prev
          );
          return;
        }

        try {
          const response = await fetch(listUrl);
          const data = (await response.json()) as { images?: ItemPreviewImage[] };
          const images = Array.isArray(data.images) ? data.images : [];
          const finalImages =
            images.length > 0
              ? images
              : (item.place?.imageUrl
                ? [{ url: item.place.imageUrl }]
                : [{ url: PLACE_IMAGE_FALLBACK }]);

          imageCacheRef.current.set(item.id, finalImages);
          setItemPreview((prev) =>
            prev?.itemId === item.id
              ? { ...prev, images: finalImages, isLoading: false }
              : prev
          );
        } catch (error) {
          console.error('[GlobeItinerary] Failed to load images', error);
          setItemPreview((prev) =>
            prev?.itemId === item.id
              ? { ...prev, images: [{ url: PLACE_IMAGE_FALLBACK }], isLoading: false }
              : prev
          );
        }
      }
    } else {
      setItemPreview(null);
    }
  }, [dispatch, pauseTour, resolveItemDescription, selectedDestination, tourState]);

  const findItemByMarkerId = useCallback((markerId: string) => {
    for (const destination of destinations) {
      for (const item of destination.activities) {
        if (item.place?.id === markerId || item.id === markerId) {
          return { item, dayId: destination.id };
        }
      }
    }
    return null;
  }, [destinations]);

  useEffect(() => {
    if (tourState !== 'playing') return;
    if (orderedActivities.length === 0) {
      stopTour();
      return;
    }
    if (tourIndex >= orderedActivities.length) {
      stopTour();
      return;
    }

    const { item, dayId } = orderedActivities[tourIndex];
    void handleItemClick(item, dayId, 'tour');

    clearTourTimer();
    tourTimerRef.current = window.setTimeout(() => {
      setTourIndex((current) => current + 1);
    }, TOUR_STEP_MS);

    return () => {
      clearTourTimer();
    };
  }, [
    clearTourTimer,
    handleItemClick,
    orderedActivities,
    stopTour,
    tourIndex,
    tourState,
  ]);

  useEffect(() => {
    if (tourState !== 'idle') {
      stopTour();
    }
  }, [destinations, stopTour, tourState]);

  const handleMarkerClick = useCallback((markerId: string) => {
    const match = findItemByMarkerId(markerId);
    if (!match) return;
    void handleItemClick(match.item, match.dayId, 'user');
  }, [findItemByMarkerId, handleItemClick]);

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

  const handlePlayTour = useCallback(() => {
    if (orderedActivities.length === 0) return;
    setTourState('playing');
    setTourIndex((current) => (tourState === 'idle' ? 0 : current));
  }, [orderedActivities.length, tourState]);

  const handlePauseTour = useCallback(() => {
    if (tourState === 'playing') {
      pauseTour();
    }
  }, [pauseTour, tourState]);

  const handleStopTour = useCallback(() => {
    stopTour();
  }, [stopTour]);

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
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none w-[320px] max-w-[90%]">
            <OrchestratorJobStatus />
          </div>
          {SHOW_TOUR_CONTROLS ? (
            <div className="absolute top-4 left-4 z-30 pointer-events-auto flex items-center gap-2 rounded-xl border border-white/10 bg-[rgba(12,16,24,0.65)] px-2 py-1 shadow-lg">
              <button
                onClick={handlePlayTour}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                  tourState === 'playing'
                    ? 'text-white/40 cursor-not-allowed'
                    : 'text-white hover:bg-white/10'
                }`}
                disabled={tourState === 'playing' || orderedActivities.length === 0}
              >
                <Play className="h-3.5 w-3.5" />
                Play
              </button>
              <button
                onClick={handlePauseTour}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                  tourState === 'playing'
                    ? 'text-white hover:bg-white/10'
                    : 'text-white/40 cursor-not-allowed'
                }`}
                disabled={tourState !== 'playing'}
              >
                <Pause className="h-3.5 w-3.5" />
                Pause
              </button>
              <button
                onClick={handleStopTour}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                  tourState === 'idle'
                    ? 'text-white/40 cursor-not-allowed'
                    : 'text-white hover:bg-white/10'
                }`}
                disabled={tourState === 'idle'}
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </button>
              <span className="pl-2 pr-1 text-[10px] uppercase tracking-wide text-white/50">
                {orderedActivities.length === 0
                  ? 'No stops'
                  : `${Math.min(tourIndex + 1, orderedActivities.length)} / ${orderedActivities.length}`}
              </span>
            </div>
          ) : null}
          <CesiumGlobe
            destinations={destinations}
            cityMarkers={cityMarkers}
            routeMarkers={visibleRouteMarkers}
            routes={routes}
            hostMarkers={visibleHostMarkers}
            placeMarkers={effectivePlaceMarkers}
            selectedDestination={selectedDestination}
            onCityMarkerClick={handleCityMarkerClick}
            onHostClick={handleHostSelection}
            onMapBackgroundClick={handleMapBackgroundClick}
            visualTarget={visualTarget}
            activeItemId={activeItemId}
            hoveredItemId={hoveredItemId}
            onItemHover={handleItemHover}
            onItemClick={handleMarkerClick}
            onZoomChange={(height) => dispatch(setCameraHeight(height))}
            itemPreview={itemPreview}
            autoCycleDurationMs={tourState === 'playing' ? TOUR_STEP_MS : null}
            isSyncing={isSyncing}
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
                        handleItemClick(item, day.id, 'user')
                      }
                      onItemHover={(itemId) => handleItemHover(itemId)}
                      onBookItem={(item) => handleBookItem(day.id, item)}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-3 gap-3">
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
                        hostPhoto: host.photo ?? undefined,
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
                        hostPhoto: host.photo ?? undefined,
                        hostCity: host.city ?? undefined,
                        hostLat: marker?.lat,
                        hostLng: marker?.lng,
                        experience,
                      });
                    }}
                    onChatExperience={(host, experience, marker) => {
                      void handleChatExperience({
                        hostId: host.id,
                        hostName: host.name,
                        hostPhoto: host.photo ?? undefined,
                        hostCity: host.city ?? undefined,
                        hostLat: marker?.lat,
                        hostLng: marker?.lng,
                        experience,
                      }).catch((error) => {
                        console.error('[GlobeItinerary] Failed to open chat thread', error);
                        alert('Failed to open chat. Please try again.');
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
        onClose={() => setPaymentModalState({ isOpen: false, bookingId: '', hostId: '', hostName: '', hostPhoto: '' })}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}
