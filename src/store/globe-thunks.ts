import { createAsyncThunk } from '@reduxjs/toolkit';
import { 
  setRouteMarkers, 
  setHostMarkers, 
  clearHostMarkers, 
  clearItinerary, 
  setDestinations, 
  setRoutes,
  setTripId,
  updateDayIds,
  setPlannerHosts,
  setPlannerHostsStatus,
  clearPlannerHosts,
} from './globe-slice';
import { convertTripToGlobeDestinations, ApiTrip } from '@/lib/api/trip-converter';
import {
  convertPlanToGlobeData,
  extractTransportPreference,
  generateMarkersFromDestinations,
  mapTransportPreferenceToMode,
} from '@/lib/ai/plan-converter';
import type { ItineraryPlan } from '@/lib/ai/types';
import type { GlobeDestination, TravelRoute } from '@/types/globe';
import { generateId } from '@/types/globe';
// Ideally slice doesn't import thunks, components import thunks.
import type { PlannerExperiencesResponse } from '@/types/planner-experiences';
import { buildHostMarkersFromPlannerHosts } from '@/lib/planner/experiences';

// Fetch the user's active trip (or create one)
export const fetchActiveTrip = createAsyncThunk(
  'globe/fetchActiveTrip',
  async (tripId: string | undefined | null, { dispatch }) => {
    // Clear previous state immediately to prevent stale data
    // dispatch(clearItinerary()); // This might cause flashing. Let component handle unmount clearing.
    // Actually, if we switch trips directly (no unmount), we need to clear.
    // But usually we navigate via router, which unmounts.
    
    try {
      dispatch(clearHostMarkers());
      let activeTrip: ApiTrip | null = null;

      // 1. If tripId provided, fetch that specific trip
      if (tripId) {
        const detailRes = await fetch(`/api/trips/${tripId}`);
        if (detailRes.status === 401 || detailRes.status === 403) {
            console.log('[fetchActiveTrip] Unauthorized/Guest accessing trip');
            return null; 
        }
        if (detailRes.ok) {
            activeTrip = await detailRes.json();
        } else {
             console.error('[fetchActiveTrip] Failed to fetch specific trip:', tripId);
             // Fallback? Or just fail? Fail for now.
             return null;
        }
      } else {
        // 2. Default behavior: Get first trip or create default
        const res = await fetch('/api/trips');
        
        // Handle Guest / Unauthorized gracefully
        if (res.status === 401 || res.status === 403) {
            console.log('[fetchActiveTrip] Guest user detected, starting in local mode');
            return null; // No trip, but no error. UI remains in "Local Mode"
        }

        if (!res.ok) throw new Error('Failed to fetch trips');
        const data = await res.json();
        
        if (data.trips && data.trips.length > 0) {
            // Fetch detail for the first one
            const firstTrip = data.trips[0];
            const detailRes = await fetch(`/api/trips/${firstTrip.id}`);
            if (detailRes.ok) {
                activeTrip = await detailRes.json();
            } 
        } else {
            // Create a default trip
            const createRes = await fetch('/api/trips', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    title: 'My First Trip', 
                    startDate: new Date().toISOString(),
                    endDate: new Date(Date.now() + 7 * 86400000).toISOString()
                })
            });
            if (!createRes.ok) {
                const errorText = await createRes.text();
                console.error('[fetchActiveTrip] Failed to create default trip:', createRes.status, errorText);
                throw new Error(`Failed to create trip: ${createRes.status} ${errorText}`);
            }
            activeTrip = await createRes.json();
        }
      }

      // Convert and update store
      if (activeTrip && activeTrip.id) {
          dispatch(setTripId(activeTrip.id));
          if (activeTrip.stops && activeTrip.stops.length > 0) {
              const globeDestinations = convertTripToGlobeDestinations(activeTrip);
              dispatch(setDestinations(globeDestinations));

              const routes = buildRoutesFromDestinations(
                globeDestinations,
                activeTrip.preferences
              );
              dispatch(setRoutes(routes));
              
              // Regenerate markers from the loaded content
              const { routeMarkers, hostMarkers } = generateMarkersFromDestinations(globeDestinations);
              dispatch(setRouteMarkers(routeMarkers));
              if (hostMarkers.length > 0) {
                  dispatch(setHostMarkers(hostMarkers));
              }
          } else {
              dispatch(clearItinerary());
          }
          return activeTrip;
      }
      return null;

    } catch (error) {
      console.error('Error fetching active trip:', error);
      throw error;
    }
  }
);

function resolveTransportPreference(preferences: unknown): TravelRoute['mode'] | null {
  if (!preferences || typeof preferences !== 'object') return null;
  const pref =
    typeof (preferences as { transportPreference?: unknown }).transportPreference === 'string'
      ? ((preferences as { transportPreference: string }).transportPreference)
      : null;
  return mapTransportPreferenceToMode(pref);
}

function buildRoutesFromDestinations(
  destinations: GlobeDestination[],
  preferences?: unknown
): TravelRoute[] {
  if (!Array.isArray(destinations) || destinations.length < 2) return [];
  const sorted = [...destinations].sort((a, b) => a.day - b.day);
  const routes: TravelRoute[] = [];
  const defaultMode = resolveTransportPreference(preferences) ?? 'flight';
  const MIN_INTERCITY_ROUTE_DISTANCE_METERS = 30000;

  const isValidCoordinate = (lat: number, lng: number) =>
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0);

  const normalizeCityKey = (value?: string): string =>
    (value ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');

  const calculateDistanceMeters = (
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
  ): number => {
    const R = 6371e3;
    const phi1 = (fromLat * Math.PI) / 180;
    const phi2 = (toLat * Math.PI) / 180;
    const deltaPhi = ((toLat - fromLat) * Math.PI) / 180;
    const deltaLambda = ((toLng - fromLng) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i];
    const to = sorted[i + 1];
    if (!isValidCoordinate(from.lat, from.lng) || !isValidCoordinate(to.lat, to.lng)) {
      continue;
    }

    const fromCityKey = normalizeCityKey(from.city || from.name);
    const toCityKey = normalizeCityKey(to.city || to.name);
    const distance = calculateDistanceMeters(from.lat, from.lng, to.lat, to.lng);
    const isSameCityHop =
      fromCityKey.length > 0 &&
      toCityKey.length > 0 &&
      fromCityKey === toCityKey;
    const isShortHop = distance < MIN_INTERCITY_ROUTE_DISTANCE_METERS;

    // Rebuilt routes should stay inter-city; short hops create noisy "star" lines in one city.
    if (isSameCityHop || isShortHop) {
      continue;
    }

    routes.push({
      id: generateId(),
      fromId: from.id,
      toId: to.id,
      fromLat: from.lat,
      fromLng: from.lng,
      toLat: to.lat,
      toLng: to.lng,
      mode: defaultMode,
      dayNumber: from.day,
    });
  }

  return routes;
}

export const fetchPlannerExperiencesByCity = createAsyncThunk(
  'globe/fetchPlannerExperiencesByCity',
  async (city: string, { dispatch }) => {
    const trimmedCity = city.trim();
    if (!trimmedCity) {
      dispatch(clearPlannerHosts());
      dispatch(clearHostMarkers());
      return { city: '', hosts: [] } as PlannerExperiencesResponse;
    }

    dispatch(setPlannerHostsStatus('loading'));

    try {
      const res = await fetch(`/api/planner/experiences?city=${encodeURIComponent(trimmedCity)}`);
      if (res.status === 401 || res.status === 403) {
        dispatch(setPlannerHosts([]));
        dispatch(setPlannerHostsStatus('error'));
        dispatch(clearHostMarkers());
        return { city: trimmedCity, hosts: [] } as PlannerExperiencesResponse;
      }
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch planner experiences: ${res.status} ${errorText}`);
      }

      const data = (await res.json()) as PlannerExperiencesResponse;
      const hosts = Array.isArray(data.hosts) ? data.hosts : [];

      dispatch(setPlannerHosts(hosts));
      dispatch(setPlannerHostsStatus('ready'));
      dispatch(setHostMarkers(buildHostMarkersFromPlannerHosts(hosts)));

      return data;
    } catch (error) {
      console.error('[fetchPlannerExperiencesByCity] Failed', error);
      dispatch(setPlannerHosts([]));
      dispatch(setPlannerHostsStatus('error'));
      dispatch(clearHostMarkers());
      throw error;
    }
  }
);

import { addLocalExperience } from './globe-slice';
import type { PlannerExperience } from '@/types/planner-experiences';
import type { RootState } from './store';

export const addExperienceToTrip = createAsyncThunk(
    'globe/addExperienceToTrip',
    async (
      {
        tripId,
        dayId,
        experience,
        host,
        dayNumber,
      }: {
        tripId: string | null;
        dayId?: string;
        dayNumber: number;
        experience: PlannerExperience & { currency?: string };
        host: { id: string; name: string; city: string; lat: number; lng: number };
      },
      { dispatch }
    ) => {
        const isTemporaryDay = dayId && (dayId.includes('-') || dayId.length < 10);
        
        // Local Mode Check OR Temporary Day Check
        if (!tripId || isTemporaryDay) {
            console.log('[addExperienceToTrip] Adding locally (No trip or temp day)', { tripId, dayId });
            
            const newItem = {
                type: 'EXPERIENCE' as const,
                title: experience.title,
                experienceId: experience.id,
                hostId: host.id, // Add hostId
                locationName: host.city,
                lat: host.lat,
                lng: host.lng,
                // Add other fields needed for UI display
                description: experience.description,
                price: experience.price,
                currency: experience.currency
            };
            
            dispatch(addLocalExperience({ dayNumber, item: newItem }));
            return { local: true, item: newItem };
        }

        // ... Existing API Logic ...
        if (!dayId) throw new Error("dayId is required for backend sync");

        try {
            const res = await fetch(`/api/trips/${tripId}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dayId,
                    experienceId: experience.id,
                    hostId: host.id, // Pass hostId for storage even if experience not in DB
                    title: experience.title,
                    type: 'EXPERIENCE',
                    locationName: host.city, // Rough approximation
                    lat: host.lat,
                    lng: host.lng,
                })
            });
            
            if (!res.ok) {
              const errorText = await res.text();
              
              // If Day Not Found (404), maybe it was deleted or never persisted? 
              // Fallback to local to avoid breaking UI?
              if (res.status === 404) {
                  console.warn('[addExperienceToTrip] 404 from API, falling back to local');
                  const newItem = {
                    type: 'EXPERIENCE' as const,
                    title: experience.title,
                    experienceId: experience.id,
                    hostId: host.id, // Add hostId for booking validation
                    locationName: host.city,
                    lat: host.lat,
                    lng: host.lng,
                    description: experience.description,
                    price: experience.price,
                    currency: experience.currency
                  };
                  dispatch(addLocalExperience({ dayNumber, item: newItem }));
                  return { local: true, item: newItem };
              }

              console.error('[addExperienceToTrip] Failed:', {
                status: res.status,
                text: errorText,
                sentBody: JSON.stringify({
                    dayId,
                    experienceId: experience.id,
                    title: experience.title,
                })
              });
              throw new Error(`Failed to add item: ${res.status} ${errorText}`);
            }
            
            // Re-fetch trip to update UI (simplest consistency strategy)
            dispatch(fetchActiveTrip());
            return await res.json();
        } catch (error) {
            console.error('Error adding experience:', error);
            throw error;
        }
    }
);

export const removeExperienceFromTrip = createAsyncThunk(
    'globe/removeExperienceFromTrip',
    async ({ tripId, itemId }: { tripId: string, itemId: string }, { dispatch }) => {
        try {
            const res = await fetch(`/api/trips/${tripId}/items/${itemId}`, {
                method: 'DELETE'
            });
            
            if (!res.ok) throw new Error('Failed to remove item');
            
            dispatch(fetchActiveTrip());
            return true;
        } catch (error) {
             console.error('Error removing experience:', error);
             throw error;
        }
    }
);

import { convertGlobeDestinationsToApiPayload } from '@/lib/api/trip-converter';
import { generateTripTitleFromPlan } from '@/lib/trips/title';

export const saveTripPlan = createAsyncThunk(
    'globe/saveTripPlan',
    async (_, { getState, dispatch }) => {
        const state = getState() as RootState;
        const tripId = state.globe.tripId;
        const destinations = state.globe.destinations;

        if (!tripId) return; 

        try {
            const payload = convertGlobeDestinationsToApiPayload(destinations);
            
            const res = await fetch(`/api/trips/${tripId}/plan`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                console.error('Failed to auto-save trip plan');
                throw new Error('Failed to save trip');
            }
            
            // Handle Day ID Sync
            try {
                const data = await res.json();
                if (data.dayIdMap) {
                     dispatch(updateDayIds(data.dayIdMap));
                }
            } catch (e) {
                // Ignore parsing errors, assume success if status ok
            }
            
            return true;
        } catch (error) {
            console.error('Error saving trip plan:', error);
            throw error;
        }
    }
);

export const saveTripPlanForTrip = createAsyncThunk(
    'globe/saveTripPlanForTrip',
    async ({ tripId, plan }: { tripId: string; plan: ItineraryPlan }, { dispatch }) => {
        if (!tripId) return;

        try {
            const { destinations } = convertPlanToGlobeData(plan);
            const payload = convertGlobeDestinationsToApiPayload(destinations);
            const title = generateTripTitleFromPlan(plan);
            const transportPreference = mapTransportPreferenceToMode(
              extractTransportPreference(plan.request)
            );
            const preferences = transportPreference ? { transportPreference } : undefined;
            
            const res = await fetch(`/api/trips/${tripId}/plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...payload,
                  title,
                  ...(preferences ? { preferences } : {}),
                }),
            });

            if (!res.ok) {
                const errorText = await res.text();
                console.error('[saveTripPlanForTrip] Failed to save trip plan:', res.status, errorText);
                throw new Error('Failed to save trip plan');
            }

            // Sync Day IDs for immediate use
            try {
                const data = await res.json();
                if (data.dayIdMap) {
                     dispatch(updateDayIds(data.dayIdMap));
                }
            } catch(e) {}

            return true;
        } catch (error) {
            console.error('[saveTripPlanForTrip] Error:', error);
            throw error;
        }
    }
);
