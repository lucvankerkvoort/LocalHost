'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Map as MapIcon } from 'lucide-react';
import { 
  CityMarkerData,
  GlobeDestination, 
  PlaceMarkerData,
  RouteMarkerData,
  TravelRoute, 
  SAMPLE_DESTINATIONS, 
  SAMPLE_ROUTES,
} from '@/types/globe';
import { ItineraryItem, createItem } from '@/types/itinerary';
import { getHostsByCity } from '@/lib/data/hosts';
import { CATEGORY_ICONS, CATEGORY_LABELS, ExperienceCategory } from '@/types';
import { ExperienceDrawer } from './experience-drawer';
import { ProposalDialog } from './proposal-dialog';

import { initThread, sendChatMessage } from '@/store/p2p-chat-slice';
import { BookingDialog } from './booking-dialog';
import { PaymentModal } from './payment/payment-modal';
import { ItineraryDayColumn } from './itinerary-day';
import { HostPanel } from './host-panel';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  hydrateGlobeState,
  setDestinations,
  setHostMarkers,
  setItineraryData,
  setSelectedDestination,
  clearItinerary,
  setHoveredItemId,
  setActiveItemId,
  setFocusedItemId,
  setVisualTarget,
} from '@/store/globe-slice';
import { 
  fetchActiveTrip, 
  addExperienceToTrip, 
  removeExperienceFromTrip,
  saveTripPlan 
} from '@/store/globe-thunks';
import { selectAllHosts, filterHostsByProximity, type HostWithLocation } from '@/store/hosts-slice';
import type { HostMarkerData } from '@/types/globe';
import { openContactHost } from '@/store/ui-slice';

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
  selectedHost: HostMarkerData | null;
  drawerOpen: boolean;
  drawerCity: string;
  selectedCategory: ExperienceCategory | 'all';
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
  const placeMarkers = useAppSelector((state) => state.globe.placeMarkers);
  const tripIdState = useAppSelector((state) => state.globe.tripId);
  const allHosts = useAppSelector(selectAllHosts);
  const activeItemId = useAppSelector((state) => state.globe.activeItemId);
  const hoveredItemId = useAppSelector((state) => state.globe.hoveredItemId);

  // Use prop ID if available (priority), otherwise state ID
  
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    dispatch(fetchActiveTrip(propTripId));

    return () => {
        dispatch(clearItinerary());
    };
  }, [dispatch, propTripId]);
  /* eslint-enable react-hooks/exhaustive-deps */
  
  const tripId = propTripId || tripIdState; 

  const selectedDestData = useMemo(() => {
    if (!selectedDestination) return null;
    return destinations.find((d) => d.id === selectedDestination) || null;
  }, [selectedDestination, destinations]);

  const addedExperienceIds = useMemo(() => {
    if (!selectedDestData) return new Set<string>();
    return new Set(
      selectedDestData.activities
        .filter(item => item.experienceId)
        .map(item => item.experienceId!)
    );
  }, [selectedDestData]);

  const [showTimeline, setShowTimeline] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Localhost drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCity, setDrawerCity] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ExperienceCategory | 'all'>('all');
  
  const [selectedHost, setSelectedHost] = useState<HostMarkerData | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const hasRestoredRef = useRef(false);

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
      selectedHost,
      drawerOpen,
      drawerCity,
      selectedCategory,
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
    selectedHost,
    drawerOpen,
    drawerCity,
    selectedCategory,
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
      setShowTimeline(snapshot.showTimeline ?? true);
      setSelectedHost(snapshot.selectedHost ?? null);
      setDrawerOpen(snapshot.drawerOpen ?? false);
      setDrawerCity(snapshot.drawerCity ?? '');
      setSelectedCategory(snapshot.selectedCategory ?? 'all');

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
    const restored = restoreItineraryState(restoreKey);
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
    candidate: any | null;
  }>({ isOpen: false, candidate: null });

  const [paymentModalState, setPaymentModalState] = useState<{
    isOpen: boolean;
    bookingId: string;
  }>({ isOpen: false, bookingId: '' });

  // Load sample data for demo
  const loadSampleData = () => {
    dispatch(
      setItineraryData({
        destinations: SAMPLE_DESTINATIONS,
        routes: SAMPLE_ROUTES,
        selectedDestinationId: SAMPLE_DESTINATIONS[0]?.id ?? null,
      })
    );
  };

  const handleViewHostProfile = useCallback((host: HostMarkerData) => {
    const restoreKey = persistItineraryState();
    const returnTo = restoreKey
      ? `/?${ITINERARY_RESTORE_PARAM}=${encodeURIComponent(restoreKey)}`
      : '/';
    const hostId = host.hostId || host.id;
    router.push(`/hosts/${hostId}?returnTo=${encodeURIComponent(returnTo)}`);
  }, [persistItineraryState, router]);


  // Proposal Dialog State
  const [pendingProposal, setPendingProposal] = useState<{
    host: { id: string; name: string; photo?: string }; 
    experience: any;
  } | null>(null);

  const handleConfirmProposal = (message: string) => {
    if (!pendingProposal) return;
    
    // 1. (Old Chat init removed - moving to post-success)

    // 2. Add to Itinerary (Persistent)
    const { host, experience } = pendingProposal;
    
    if (tripId && selectedDestination) {
       dispatch(addExperienceToTrip({
         tripId: tripId || null,
         dayId: selectedDestData?.id, 
         dayNumber: selectedDestData?.day || 1,
         experience,
         host
       })).unwrap().then((result: any) => {
           if (result.local) {
               setPendingProposal(null);
               return; 
           }
           // result should be { item, booking }
           if (result && result.booking) {
               console.log("Experience added, starting chat for booking:", result.booking.id);
               
               // Initialize thread with bookingId
               dispatch(initThread({
                   bookingId: result.booking.id,
                   hostId: host.id,
                   hostName: host.name,
                   hostPhoto: host.photo || ''
               }));

               // Send the message
               dispatch(sendChatMessage({
                   bookingId: result.booking.id,
                   content: message
               }));
           }
       }).catch(err => {
           console.error("Failed to add experience and start chat:", err);
       });
    } else {
       console.warn('[GlobeItinerary] Cannot add experience: Missing tripId or selectedDestination');
    }
    
    // 3. Cleanup
    setPendingProposal(null);
    setDrawerOpen(false);
  };

  // Add Experience from Drawer
  const handleAddExperience = (host: any, experience: any) => {
    // Check if already added (Toggle Remove)
    if (addedExperienceIds.has(experience.id)) {
      if (!selectedDestination) return;
      
      const itemToRemove = selectedDestData?.activities.find(item => item.experienceId === experience.id);
      
      if (itemToRemove && tripId) {
          dispatch(removeExperienceFromTrip({ tripId, itemId: itemToRemove.id }));
      } else {
          console.warn('Cannot remove: item not found or missing tripId');
      }
    } else {
        // Open proposal dialog
        setPendingProposal({ host, experience });
    }
  };

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
      let candidateData = null;

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

        const data = await res.json();
        console.log('[GlobeItinerary] Candidate created:', data);
        candidateData = data.candidate;
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
        const res = await fetch(`/api/itinerary/candidates?dayNumber=${destinations.find(d => d.id === dayId)?.day}`);
        const data = await res.json();
        candidateData = data.candidates.find((c: any) => c.id === candidateId);
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

  const handlePaymentSuccess = () => {
      setPaymentModalState({ isOpen: false, bookingId: '' });
      // Refresh to update statuses
      if (tripId) dispatch(fetchActiveTrip(tripId));
      alert('Payment Successful!');
  };

  // Itinerary Item Handlers
  const handleEditItem = (dayId: string, updatedItem: ItineraryItem) => {
    const nextDestinations = destinations.map(dest => {
      if (dest.id === dayId) {
        return {
          ...dest,
          activities: dest.activities.map(item => item.id === updatedItem.id ? updatedItem : item)
        };
      }
      return dest;
    });
    dispatch(setDestinations(nextDestinations));
  };

  const handleDeleteItem = (dayId: string, itemId: string) => {
    const nextDestinations = destinations.map(dest => {
      if (dest.id === dayId) {
        return {
          ...dest,
          activities: dest.activities.filter(item => item.id !== itemId)
        };
      }
      return dest;
    });
    dispatch(setDestinations(nextDestinations));
  };

  const handleDragStart = (e: React.DragEvent, dayId: string, item: ItineraryItem) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ item, sourceDayId: dayId }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetDayId: string) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const { item, sourceDayId } = data;
      
      if (sourceDayId === targetDayId) return; // Reordering within list not fully implemented here yet

      // For now, mostly handling simple drops or just reordering
      const nextDestinations = destinations.map(dest => {
        if (dest.id === targetDayId) {
          // Move to end if dropped on day (simplified)
          if (!dest.activities.find(i => i.id === item.id)) {
            return {
              ...dest,
              activities: [...dest.activities, { ...item, position: dest.activities.length }]
            };
          }
        }
        return dest;
      });
      dispatch(setDestinations(nextDestinations));
       
    } catch (err) {
      console.error('Drop failed', err);
    }
  };

  const cityMarkers = useMemo<CityMarkerData[]>(() => {
    if (destinations.length === 0) return [];

    type CityCluster = CityMarkerData & {
      count: number;
      latSum: number;
      lngSum: number;
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
        count: 1,
        latSum: dest.lat,
        lngSum: dest.lng,
        minDay: dest.day,
      };
      clusters.push(cluster);
      return cluster;
    };

    const addToCluster = (cluster: CityCluster, dest: GlobeDestination) => {
      cluster.dayIds.push(dest.id);
      cluster.dayNumbers.push(dest.day);
      cluster.count += 1;
      cluster.latSum += dest.lat;
      cluster.lngSum += dest.lng;
      cluster.lat = cluster.latSum / cluster.count;
      cluster.lng = cluster.lngSum / cluster.count;
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
    setSelectedHost(null);
  }, [destinations, dispatch, selectedDestination]);

  // Get hosts near the selected destination using proximity filtering
  const nearbyHosts: HostMarkerData[] = useMemo(() => {
    if (!selectedDestData) return [];
    
    // Filter hosts within 100km of the selected destination
    const hostsNearby = filterHostsByProximity(
      allHosts,
      selectedDestData.lat,
      selectedDestData.lng,
      100 // 100km radius
    );
    
    // Convert HostWithLocation to HostMarkerData format
    return hostsNearby.map((host): HostMarkerData => ({
      id: host.id,
      hostId: host.id,
      name: host.name,
      lat: host.lat,
      lng: host.lng,
      photo: host.photo,
      headline: host.quote,
      rating: host.experiences[0]?.rating,
      experienceCount: host.experiences.length,
    }));
  }, [selectedDestData, allHosts]);

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

  return (
    <div className="h-full w-full flex flex-col bg-[var(--deep-space-blue)]">
      {/* Header */}
      {/* Floating Map Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
           {!tripId && (
              <button
                onClick={() => {
                   const confirmSave = window.confirm("Join Localhost to save your itinerary?");
                   if (confirmSave) window.location.href = '/auth/signin?callbackUrl=/';
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-[var(--princeton-orange)] text-white font-medium hover:bg-[var(--princeton-dark)] transition-colors shadow-lg animate-pulse"
              >
                Save Itinerary
              </button>
           )}
           <button
             onClick={loadSampleData}
             className="px-3 py-1.5 text-sm rounded-lg bg-[var(--background)]/80 backdrop-blur-md border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--background)] transition-colors shadow-sm"
           >
             Load Demo
           </button>
           <button
             onClick={() => setShowTimeline(!showTimeline)}
             className="px-3 py-1.5 text-sm rounded-lg bg-[var(--background)]/80 backdrop-blur-md border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--background)] transition-colors shadow-sm"
           >
             {showTimeline ? 'Hide' : 'Show'} Timeline
           </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Globe */}
        <div className="flex-1 relative">
          <CesiumGlobe
            destinations={destinations}
            cityMarkers={cityMarkers}
            routeMarkers={routeMarkers}
            hostMarkers={hostMarkers}
            placeMarkers={placeMarkers}
            selectedDestination={selectedDestination}
            onCityMarkerClick={handleCityMarkerClick}
            onHostClick={(host) => setSelectedHost(host)}
            visualTarget={visualTarget}
            activeItemId={activeItemId}
            hoveredItemId={hoveredItemId}
            onItemHover={handleItemHover}
          />
          
          
          {/* Left Itinerary Panel - Only show if destinations exist */}
          <div 
             className={`absolute top-0 left-0 bottom-0 z-10 transition-all duration-300 ease-in-out flex flex-col border-r border-white/10 ${
               showTimeline && destinations.length > 0 ? (isCollapsed ? 'w-[60px]' : 'w-[360px]') : '-translate-x-full absolute'
             } bg-[rgba(12,16,24,0.2)] backdrop-blur-[6px]`}
          >
             {/* Sticky Header */}
             <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[rgba(12,16,24,0.2)] backdrop-blur-[6px] sticky top-0 z-20 h-[60px]">
                {!isCollapsed ? (
                    <>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                           <span className="text-[var(--princeton-orange)]">●</span> Your Itinerary
                        </h2>
                        <div className="flex items-center gap-2">
                            <div className="text-xs text-[var(--muted-foreground)]">
                               {destinations.length} Days
                            </div>
                            <button 
                                onClick={() => setIsCollapsed(true)}
                                className="p-1 hover:bg-white/10 rounded-md text-white/70 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center w-full gap-4">
                        <button 
                            onClick={() => setIsCollapsed(false)}
                            className="p-1 hover:bg-white/10 rounded-md text-white/70 transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <div className="text-[var(--princeton-orange)]">●</div>
                    </div>
                )}
             </div>

             {/* Scrollable Timeline List (Hidden when collapsed) */}
             {!isCollapsed && (
             <div 
                className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent p-4 space-y-8"
                ref={listRef}
                onScroll={handleListScroll}
             >
                {destinations.length === 0 ? (
                   <div className="text-center text-[var(--muted-foreground)] py-12">
                      <p>No destinations yet.</p>
                      <button onClick={loadSampleData} className="mt-4 text-[var(--princeton-orange)] hover:underline">
                         Load Demo Data
                      </button>
                   </div>
                ) : (
                   destinations.map((day) => (
                      <ItineraryDayColumn
                         key={day.id}
                         dayId={day.id}
                         dayNumber={day.day}
                         title={day.name}
                         date={day.date}
                         activities={day.activities}
                         onAddActivity={(dayId) => {
                            if (dayId) dispatch(setSelectedDestination(dayId));
                            setDrawerCity(day.name);
                            setDrawerOpen(true);
                         }}
                         isSpaceOptimized={false}
                         isActive={day.id === selectedDestination}
                         onSelect={() => handleDaySelect(day.id)}
                         onItemClick={(item) => handleItemClick(
                             item.id, 
                             day.id, 
                             item.place?.location?.lat, 
                             item.place?.location?.lng
                         )}
                         onItemHover={(itemId) => handleItemHover(itemId)}
                         onEditItem={(item) => handleEditItem(day.id, item)}
                         onDeleteItem={(itemId) => handleDeleteItem(day.id, itemId)}
                         onBookItem={(item) => handleBookItem(day.id, item)}
                      />
                   ))
                )}
             </div>
             )}
             
             {isCollapsed && (
                 <div className="flex-1 flex flex-col items-center py-4 gap-4 opacity-50">
                     {/* Slim rail icons or indicators could go here */}
                     {destinations.map(d => (
                         <div key={d.id} className="w-1.5 h-1.5 rounded-full bg-white/20" />
                     ))}
                 </div>
             )}

             {/* Bottom Action */}
             <div className="p-4 border-t border-white/10 bg-[rgba(12,16,24,0.2)] backdrop-blur-[6px]">
                {!isCollapsed ? (
                    <button
                       onClick={() => {
                            // Open drawer for the currently selected city or first city
                            const targetCity = selectedDestData?.name || destinations[0]?.name || 'San Francisco';
                            setDrawerCity(targetCity);
                            setDrawerOpen(true);
                       }}
                       className="w-full py-2.5 bg-[var(--princeton-orange)] hover:bg-[var(--princeton-dark)] text-white rounded-lg font-medium transition-all shadow-lg hover:shadow-orange-500/20 flex items-center justify-center gap-2"
                    >
                       <span>+ Add Activity</span>
                    </button>
                ) : (
                    <button
                        onClick={() => setIsCollapsed(false)}
                        className="w-full flex justify-center py-2 text-[var(--princeton-orange)] hover:bg-white/5 rounded-md"
                    >
                        <span className="text-xl">+</span>
                    </button>
                )}
             </div>
          </div>
          
          {/* Host Selection Popup */}
          {selectedHost && (
            <div className="absolute bottom-4 left-4 z-10 bg-white rounded-xl shadow-lg border border-[var(--border)] p-4 max-w-xs animate-in slide-in-from-bottom-2">
              <div className="flex items-start gap-3">
                <img 
                  src={selectedHost.photo || '/placeholder-host.jpg'} 
                  alt={selectedHost.name}
                  className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[var(--foreground)] truncate">🏠 {selectedHost.name}</h3>
                  <p className="text-sm text-[var(--muted-foreground)]">Local Host</p>
                </div>
                <button
                  onClick={() => setSelectedHost(null)}
                  className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  ✕
                </button>
              </div>
              
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    if (selectedHost) {
                       dispatch(openContactHost({ 
                         hostId: selectedHost.hostId || selectedHost.id 
                       }));
                       setSelectedHost(null);
                    }
                  }}
                  className="flex-1 px-3 py-2 border border-[var(--border)] text-[var(--foreground)] rounded-lg text-sm font-medium hover:bg-[var(--muted)] transition-colors"
                >
                  Message
                </button>
                <button
                  onClick={() => selectedHost && handleViewHostProfile(selectedHost)}
                  className="flex-1 px-3 py-2 border border-[var(--border)] text-[var(--foreground)] rounded-lg text-sm font-medium hover:bg-[var(--muted)] transition-colors"
                >
                  Profile
                </button>
                <button
                  onClick={() => {
                    if (selectedDestination) {
                      handleAddExperience(
                        { id: selectedHost.id, name: selectedHost.name },
                        { id: `custom-${selectedHost.id}`, title: `Experience with ${selectedHost.name}`, category: 'local-host', price: 0 }
                      );
                      setSelectedHost(null);
                    } else {
                      alert('Please select a day on the map first!');
                    }
                  }}
                  className="flex-1 px-3 py-2 bg-[var(--princeton-orange)] text-white rounded-lg text-sm font-medium hover:bg-[var(--princeton-dark)] transition-colors"
                >
                  Add to {selectedDestData ? `Day ${selectedDestData.day}` : 'Trip'}
                </button>
              </div>
            </div>
          )}
        </div>

      {/* Host Panel - Right side (only show when trip exists) */}
      {destinations.length > 0 && (
        <HostPanel
          hosts={nearbyHosts.length > 0 ? nearbyHosts : hostMarkers}
          selectedHostId={selectedHost?.id}
          selectedDayNumber={selectedDestData?.day}
          addedExperienceIds={addedExperienceIds}
          onHostClick={(host) => setSelectedHost(host)}
          onViewProfile={handleViewHostProfile}
          onAddExperience={(host, experience) => {
            if (selectedDestination) {
              handleAddExperience(
                { id: host.id, name: host.name },
                experience
              );
            } else {
              alert('Please select a day on the map first!');
            }
          }}
        />
      )}
    </div>

    {/* Timeline */}
      {showTimeline && destinations.length > 0 && (
        <div className="flex-shrink-0 bg-[var(--background)] border-t border-[var(--border)] p-4">
          <div className="flex gap-4 overflow-x-auto pb-2">
            {destinations.map((dest) => (
              <button
                key={dest.id}
                onClick={() => dispatch(setSelectedDestination(dest.id))}
                className={`flex-shrink-0 px-4 py-2 rounded-lg border-2 transition-all ${
                  selectedDestination === dest.id
                    ? 'border-[var(--princeton-orange)] bg-[var(--princeton-orange)]/10'
                    : 'border-[var(--border)] hover:border-[var(--blue-green)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: dest.color }}
                  />
                  <span className="font-medium text-[var(--foreground)]">
                    Day {dest.day}: {dest.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Experience Drawer */}
      <ExperienceDrawer
        isOpen={drawerOpen}
        dayId={selectedDestination || ''}
        city={drawerCity}
        onClose={() => setDrawerOpen(false)}
        onAddExperience={handleAddExperience}
      />

      <ProposalDialog
        isOpen={!!pendingProposal}
        onClose={() => setPendingProposal(null)}
        onConfirm={handleConfirmProposal}
        hostName={pendingProposal?.host.name || ''}
        experienceTitle={pendingProposal?.experience.title || ''}
      />
      
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
