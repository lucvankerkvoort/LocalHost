import { createAsyncThunk } from '@reduxjs/toolkit';
import { setDestinations, setTripId } from './globe-slice';
import { convertTripToGlobeDestinations, ApiTrip } from '@/lib/api/trip-converter';
import { RootState } from './store'; // Need to be careful with circular imports if store imports this. 
// Ideally slice doesn't import thunks, components import thunks.

// Fetch the user's active trip (or create one)
export const fetchActiveTrip = createAsyncThunk(
  'globe/fetchActiveTrip',
  async (_, { dispatch }) => {
    try {
      // 1. Get trips
      const res = await fetch('/api/trips');
      
      // Handle Guest / Unauthorized gracefully
      if (res.status === 401 || res.status === 403) {
          console.log('[fetchActiveTrip] Guest user detected, starting in local mode');
          return null; // No trip, but no error. UI remains in "Local Mode"
      }

      if (!res.ok) throw new Error('Failed to fetch trips');
      const data = await res.json();
      
      let activeTrip: ApiTrip;

      if (data.trips && data.trips.length > 0) {
        activeTrip = data.trips[0];
        const detailRes = await fetch(`/api/trips/${activeTrip.id}`);
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
        if (!createRes.ok) throw new Error('Failed to create trip');
        activeTrip = await createRes.json();
      }

      // Convert and update store
      if (activeTrip && activeTrip.stops) {
          dispatch(setTripId(activeTrip.id));
          const globeDestinations = convertTripToGlobeDestinations(activeTrip);
          dispatch(setDestinations(globeDestinations));
          return activeTrip;
      }
      return null;

    } catch (error) {
      console.error('Error fetching active trip:', error);
      throw error;
    }
  }
);

import { addLocalExperience } from './globe-slice';

export const addExperienceToTrip = createAsyncThunk(
    'globe/addExperienceToTrip',
    async ({ tripId, dayId, experience, host, dayNumber }: { tripId: string | null, dayId?: string, dayNumber: number, experience: any, host: any }, { dispatch }) => {
        const isTemporaryDay = dayId && (dayId.includes('-') || dayId.length < 10);
        
        // Local Mode Check OR Temporary Day Check
        if (!tripId || isTemporaryDay) {
            console.log('[addExperienceToTrip] Adding locally (No trip or temp day)', { tripId, dayId });
            
            const newItem = {
                type: 'EXPERIENCE',
                title: experience.title,
                experienceId: experience.id,
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
                    type: 'EXPERIENCE',
                    title: experience.title,
                    experienceId: experience.id,
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
