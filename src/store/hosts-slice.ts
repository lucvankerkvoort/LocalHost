import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { createSelector } from '@reduxjs/toolkit';
import { HOSTS, type Host } from '@/lib/data/hosts';
import { getCityCoordinates } from '@/lib/data/city-coordinates';

/**
 * Host with geolocation data for proximity filtering.
 */
export interface HostWithLocation extends Host {
  lat: number;
  lng: number;
}

interface HostsState {
  allHosts: HostWithLocation[];
  loading: boolean;
  error: string | null;
}

/**
 * Initialize hosts with their city coordinates.
 */
function initializeHostsWithLocations(): HostWithLocation[] {
  return HOSTS.map((host) => {
    const coords = getCityCoordinates(host.city);
    if (!coords) {
      console.warn(`[hosts-slice] No coordinates found for city: ${host.city}`);
    }
    return {
      ...host,
      lat: coords?.lat ?? 0,
      lng: coords?.lng ?? 0,
    };
  }).filter((host) => host.lat !== 0 || host.lng !== 0); // Filter out hosts without valid coordinates
}

const initialState: HostsState = {
  allHosts: initializeHostsWithLocations(),
  loading: false,
  error: null,
};

const hostsSlice = createSlice({
  name: 'hosts',
  initialState,
  reducers: {
    setHosts(state, action: PayloadAction<HostWithLocation[]>) {
      state.allHosts = action.payload;
    },
    addHost(state, action: PayloadAction<HostWithLocation>) {
      const exists = state.allHosts.some((h) => h.id === action.payload.id);
      if (!exists) {
        state.allHosts.push(action.payload);
      }
    },
    removeHost(state, action: PayloadAction<string>) {
      state.allHosts = state.allHosts.filter((h) => h.id !== action.payload);
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
  },
});

export const { setHosts, addHost, removeHost, setLoading, setError } = hostsSlice.actions;

// ============================================================================
// Selectors
// ============================================================================

/**
 * Haversine formula to calculate distance between two points in kilometers.
 */
function getDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Select all hosts from state.
 */
export const selectAllHosts = (state: { hosts: HostsState }) => state.hosts.allHosts;

/**
 * Select hosts loading state.
 */
export const selectHostsLoading = (state: { hosts: HostsState }) => state.hosts.loading;

/**
 * Select hosts error state.
 */
export const selectHostsError = (state: { hosts: HostsState }) => state.hosts.error;

/**
 * Create a memoized selector for hosts near a specific location.
 * 
 * @param lat - Target latitude
 * @param lng - Target longitude
 * @param radiusKm - Search radius in kilometers (default: 100km)
 */
export const makeSelectHostsNearLocation = () =>
  createSelector(
    [
      selectAllHosts,
      (_state: { hosts: HostsState }, lat: number) => lat,
      (_state: { hosts: HostsState }, _lat: number, lng: number) => lng,
      (_state: { hosts: HostsState }, _lat: number, _lng: number, radiusKm: number = 100) => radiusKm,
    ],
    (hosts, lat, lng, radiusKm) => {
      if (lat === 0 && lng === 0) return [];
      
      return hosts
        .map((host) => ({
          host,
          distance: getDistanceKm(lat, lng, host.lat, host.lng),
        }))
        .filter(({ distance }) => distance <= radiusKm)
        .sort((a, b) => a.distance - b.distance)
        .map(({ host }) => host);
    }
  );

/**
 * Non-memoized utility for one-off proximity checks.
 */
export function filterHostsByProximity(
  hosts: HostWithLocation[],
  lat: number,
  lng: number,
  radiusKm: number = 100
): HostWithLocation[] {
  if (lat === 0 && lng === 0) return [];
  
  return hosts
    .map((host) => ({
      host,
      distance: getDistanceKm(lat, lng, host.lat, host.lng),
    }))
    .filter(({ distance }) => distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .map(({ host }) => host);
}

export default hostsSlice.reducer;
