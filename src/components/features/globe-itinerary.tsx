'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { BookingDialog } from './booking-dialog';
import { ItineraryDayColumn } from './itinerary-day';
import { HostPanel } from './host-panel';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  hydrateGlobeState,
  setDestinations,
  setHostMarkers,
  setItineraryData,
  setSelectedDestination,
} from '@/store/globe-slice';
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

export default function GlobeItinerary() {
  const dispatch = useAppDispatch();
  const destinations = useAppSelector((state) => state.globe.destinations);
  const routes = useAppSelector((state) => state.globe.routes);
  const routeMarkers = useAppSelector((state) => state.globe.routeMarkers);
  const selectedDestination = useAppSelector((state) => state.globe.selectedDestination);
  const visualTarget = useAppSelector((state) => state.globe.visualTarget);
  const hostMarkers = useAppSelector((state) => state.globe.hostMarkers);
  const placeMarkers = useAppSelector((state) => state.globe.placeMarkers);
  const allHosts = useAppSelector(selectAllHosts);

  const [showTimeline, setShowTimeline] = useState(true);
  
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

  // Booking State
  const [bookingDialogState, setBookingDialogState] = useState<{
    isOpen: boolean;
    candidate: any | null;
  }>({ isOpen: false, candidate: null });

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


  // Add Experience from Drawer
  const handleAddExperience = (host: any, experience: any) => {
    if (!selectedDestination) return;

    const nextDestinations = destinations.map(dest => {
      if (dest.id === selectedDestination) {
        const newItem = createItem('localhost', experience.title, dest.activities.length, {
          location: `${host.name}'s Place`,
          hostId: host.id,
          experienceId: experience.id,
          description: `${experience.category} • ${experience.price / 100}$`,
        });
        return {
          ...dest,
          activities: [...dest.activities, newItem]
        };
      }
      return dest;
    });
    dispatch(setDestinations(nextDestinations));
    setDrawerOpen(false);
  };

  // Booking Handler
  const handleBookItem = async (dayId: string, item: ItineraryItem) => {
    if (item.type !== 'localhost' || !item.hostId || !item.experienceId) return;

    try {
      let candidateId = item.candidateId;
      let candidateData = null;

      // If no candidate yet, create one
      if (!candidateId) {
        const dest = destinations.find(d => d.id === dayId);
        if (!dest) return;

        // Call API to create candidate
        const res = await fetch('/api/itinerary/candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hostId: item.hostId,
            experienceId: item.experienceId,
            dayNumber: dest.day,
            date: null, // Could infer from dest.date/day if available
            timeSlot: null,
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to create booking candidate');
        }

        const data = await res.json();
        candidateData = data.candidate;
        candidateId = candidateData.id;

        // Update item with candidateId
        const nextDestinations = destinations.map(d => {
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
        dispatch(setDestinations(nextDestinations));
      } else {
        // Fetch existing candidate? Or just assume we can pass minimal data?
        // Ideally we should fetch fresh candidate data but for now we might construct it or fetch it.
        // Let's assume we need to fetch it to get current status etc. if we want to be safe,
        // but for speed let's construct what we can or rely on what we have if we used the API.
        // Actually, the BookingDialog expects ExperienceCandidateData.
        
        // Let's try to fetch it to be sure
        const res = await fetch(`/api/itinerary/candidates?dayNumber=${destinations.find(d => d.id === dayId)?.day}`);
        const data = await res.json();
        candidateData = data.candidates.find((c: any) => c.id === candidateId);
      }

      if (candidateData) {
        setBookingDialogState({
          isOpen: true,
          candidate: candidateData,
        });
      }

    } catch (error) {
      console.error('Booking flow error:', error);
      alert('Failed to start booking flow. Please try again.');
    }
  };

  const handleConfirmBooking = async (candidateId: string) => {
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId }),
      });

      if (!res.ok) {
        throw new Error('Booking failed');
      }

      const data = await res.json();

      // Update item status locally
      const nextDestinations = destinations.map(dest => {
        return {
          ...dest,
          activities: dest.activities.map(item => {
             if (item.candidateId === candidateId) {
               return { ...item, status: 'BOOKED' as const };
             }
             return item;
          })
        };
      });
      dispatch(setDestinations(nextDestinations));
      
      // Close dialog
      setBookingDialogState({ isOpen: false, candidate: null });
      
      // Optionally show success message or redirect to chat
      
    } catch (error) {
      console.error('Confirm booking error:', error);
      throw error; // Dialog will handle error state
    }
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
      // Implementing basic reorder within same list:
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

  const selectedDestData = destinations.find(d => d.id === selectedDestination);

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

  return (
    <div className="h-screen flex flex-col bg-[var(--deep-space-blue)]">
      {/* Header */}
      {/* Floating Map Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
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
          />
          
          {/* Itinerary Panel for Selected Day */}
          {selectedDestData && (
             <div className="absolute top-4 left-4 z-10">
                <ItineraryDayColumn 
                  day={{
                      id: selectedDestData.id,
                      date: `Day ${selectedDestData.day}`, // Mapping for display
                      dayNumber: selectedDestData.day,
                      items: selectedDestData.activities
                  }}
                  onAddItem={() => {
                      setDrawerCity(selectedDestData.name);
                      setDrawerOpen(true);
                  }}
                  onEditItem={handleEditItem}
                  onDeleteItem={handleDeleteItem}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onBookItem={handleBookItem}
                />
             </div>
          )}
          
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
                        { title: `Experience with ${selectedHost.name}`, category: 'local-host', price: 0 }
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
          onHostClick={(host) => setSelectedHost(host)}
          onViewProfile={handleViewHostProfile}
          onAddExperience={(host, experience) => {
            if (selectedDestination) {
              handleAddExperience(
                { id: host.id, name: host.name },
                { title: experience.title, category: experience.category, price: experience.price }
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
      
      {/* Booking Dialog */}
      {bookingDialogState.candidate && (
        <BookingDialog
          candidate={bookingDialogState.candidate}
          isOpen={bookingDialogState.isOpen}
          onClose={() => setBookingDialogState({ ...bookingDialogState, isOpen: false })}
          onConfirm={handleConfirmBooking}
        />
      )}
    </div>
  );
}
