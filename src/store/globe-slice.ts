import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { GlobeDestination, RouteMarkerData, TravelRoute, HostMarkerData, PlaceMarkerData } from '@/types/globe';
import type { PlannerExperienceHost } from '@/types/planner-experiences';
import type { ItineraryPlan } from '@/lib/ai/types';
import { convertPlanToGlobeData } from '@/lib/ai/plan-converter';
import { toolCallReceived, type ToolCallEvent } from './tool-calls-slice';

const MAX_PLACE_DISTANCE_METERS = 300000;

interface GlobeState {
  tripId: string | null;
  visualTarget: { lat: number; lng: number; height?: number } | null;
  cameraHeight: number | null;
  destinations: GlobeDestination[];
  routes: TravelRoute[];
  routeMarkers: RouteMarkerData[];
  selectedDestination: string | null;
  hostMarkers: HostMarkerData[];
  plannerHosts: PlannerExperienceHost[];
  plannerHostsStatus: 'idle' | 'loading' | 'ready' | 'error';
  placeMarkers: PlaceMarkerData[];
  // Sync state for list <-> map interaction
  hoveredItemId: string | null;
  activeItemId: string | null;
  focusedItemId: string | null;
  selectedHostId: string | null;
  selectedExperienceId: string | null;
}

function deduplicate<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

const initialState: GlobeState = {
  tripId: null,
  visualTarget: null,
  cameraHeight: null,
  destinations: [],
  routes: [],
  routeMarkers: [],
  selectedDestination: null,
  hostMarkers: [],
  plannerHosts: [],
  plannerHostsStatus: 'idle',
  placeMarkers: [],
  hoveredItemId: null,
  activeItemId: null,
  focusedItemId: null,
  selectedHostId: null,
  selectedExperienceId: null,
};

function applyPlan(state: GlobeState, plan: ItineraryPlan) {
  const { destinations, routes, routeMarkers } = convertPlanToGlobeData(plan);
  state.destinations = destinations;
  state.routes = routes;
  state.routeMarkers = routeMarkers;
  state.selectedDestination = destinations[0]?.id ?? null;
  state.visualTarget = null;
  state.placeMarkers = [];
  state.hoveredItemId = null;
  state.activeItemId = null;
  state.focusedItemId = null; 
  state.selectedHostId = null;
  state.selectedExperienceId = null;
  // Note: Localhost AI generated plans don't strictly have a DB TripID yet unless saved.
}

const globeSlice = createSlice({
  name: 'globe',
  initialState,
  reducers: {
    setTripId(state, action: PayloadAction<string>) {
      state.tripId = action.payload;
    },
    setVisualTarget(state, action: PayloadAction<GlobeState['visualTarget']>) {
      state.visualTarget = action.payload;
    },
    setCameraHeight(state, action: PayloadAction<number | null>) {
      state.cameraHeight = action.payload;
    },
    clearVisualTarget(state) {
      state.visualTarget = null;
    },
    setDestinations(state, action: PayloadAction<GlobeDestination[]>) {
      state.destinations = action.payload;
      if (state.selectedDestination) {
        const stillExists = state.destinations.some(
          (dest) => dest.id === state.selectedDestination
        );
        if (!stillExists) {
          state.selectedDestination = state.destinations[0]?.id ?? null;
        }
      }
    },
    setRoutes(state, action: PayloadAction<TravelRoute[]>) {
      state.routes = action.payload;
    },
    setRouteMarkers(state, action: PayloadAction<RouteMarkerData[]>) {
      state.routeMarkers = action.payload;
    },
    setSelectedDestination(state, action: PayloadAction<string | null>) {
      state.selectedDestination = action.payload;
    },
    setSelectedHostId(state, action: PayloadAction<string | null>) {
      state.selectedHostId = action.payload;
    },
    clearSelectedHostId(state) {
      state.selectedHostId = null;
    },
    setSelectedExperienceId(state, action: PayloadAction<string | null>) {
      state.selectedExperienceId = action.payload;
    },
    clearSelectedExperienceId(state) {
      state.selectedExperienceId = null;
    },
    setHostMarkers(state, action: PayloadAction<HostMarkerData[]>) {
      state.hostMarkers = action.payload;
    },
    setPlannerHosts(state, action: PayloadAction<PlannerExperienceHost[]>) {
      state.plannerHosts = action.payload;
    },
    setPlannerHostsStatus(state, action: PayloadAction<GlobeState['plannerHostsStatus']>) {
      state.plannerHostsStatus = action.payload;
    },
    clearPlannerHosts(state) {
      state.plannerHosts = [];
      state.plannerHostsStatus = 'idle';
    },
    addHostMarkers(state, action: PayloadAction<HostMarkerData[]>) {
      const existingIds = new Set(state.hostMarkers.map((host) => host.id));
      const next = action.payload.filter((host) => !existingIds.has(host.id));
      state.hostMarkers = [...state.hostMarkers, ...next];
    },
    clearHostMarkers(state) {
      state.hostMarkers = [];
    },
    setPlaceMarkers(state, action: PayloadAction<PlaceMarkerData[]>) {
      state.placeMarkers = action.payload;
    },
    addPlaceMarker(state, action: PayloadAction<PlaceMarkerData>) {
      const index = state.placeMarkers.findIndex(
        (marker) => marker.id === action.payload.id
      );
      if (index >= 0) {
        state.placeMarkers[index] = action.payload;
      } else {
        state.placeMarkers.push(action.payload);
      }
      if (state.placeMarkers.length > 50) {
        state.placeMarkers.shift();
      }
    },
    clearPlaceMarkers(state) {
      state.placeMarkers = [];
    },
    clearItinerary(state) {
      state.destinations = [];
      state.routes = [];
      state.routeMarkers = [];
      state.selectedDestination = null;
      state.visualTarget = null;
      state.cameraHeight = null;
      state.hostMarkers = [];
      state.plannerHosts = [];
      state.plannerHostsStatus = 'idle';
      state.placeMarkers = [];
      state.hoveredItemId = null;
      state.activeItemId = null;
      state.focusedItemId = null;
      state.selectedHostId = null;
      state.selectedExperienceId = null;
    },
    setItineraryFromPlan(state, action: PayloadAction<ItineraryPlan>) {
      applyPlan(state, action.payload);
    },
    setItineraryData(
      state,
      action: PayloadAction<{
        destinations: GlobeDestination[];
        routes: TravelRoute[];
        routeMarkers?: RouteMarkerData[];
        selectedDestinationId?: string | null;
      }>
    ) {
      state.destinations = action.payload.destinations;
      state.routes = action.payload.routes;
      state.routeMarkers = deduplicate(action.payload.routeMarkers ?? []);
      state.selectedDestination =
        action.payload.selectedDestinationId ??
        action.payload.destinations[0]?.id ??
        null;
      state.visualTarget = null;
      state.placeMarkers = [];
      state.hoveredItemId = null;
      state.activeItemId = null;
      state.focusedItemId = null;
      state.selectedHostId = null;
      state.selectedExperienceId = null;
    },
    hydrateGlobeState(
      state,
      action: PayloadAction<Partial<GlobeState>>
    ) {
      if (action.payload.destinations) {
        state.destinations = action.payload.destinations;
      }
      if (action.payload.routes) {
        state.routes = action.payload.routes;
      }
      if (action.payload.routeMarkers) {
        state.routeMarkers = deduplicate(action.payload.routeMarkers);
      }
      if (Object.prototype.hasOwnProperty.call(action.payload, 'selectedDestination')) {
        state.selectedDestination = action.payload.selectedDestination ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(action.payload, 'visualTarget')) {
        state.visualTarget = action.payload.visualTarget ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(action.payload, 'cameraHeight')) {
        state.cameraHeight = action.payload.cameraHeight ?? null;
      }
      if (action.payload.hostMarkers) {
        state.hostMarkers = deduplicate(action.payload.hostMarkers);
      }
      if (action.payload.plannerHosts) {
        state.plannerHosts = action.payload.plannerHosts;
      }
      if (Object.prototype.hasOwnProperty.call(action.payload, 'plannerHostsStatus')) {
        state.plannerHostsStatus = action.payload.plannerHostsStatus ?? 'idle';
      }
      if (action.payload.placeMarkers) {
        state.placeMarkers = deduplicate(action.payload.placeMarkers);
      }
      if (Object.prototype.hasOwnProperty.call(action.payload, 'selectedHostId')) {
        state.selectedHostId = action.payload.selectedHostId ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(action.payload, 'selectedExperienceId')) {
        state.selectedExperienceId = action.payload.selectedExperienceId ?? null;
      }
    },
    addLocalExperience(
      state,
      action: PayloadAction<{ dayNumber: number; item: any }>
    ) {
      const { dayNumber, item } = action.payload;
      const destination = state.destinations.find((d) => d.day === dayNumber);
      if (destination) {
        // Ensure activities array exists
        if (!destination.activities) destination.activities = [];
        
        // Add item with temporary ID if needed
        const newItem = {
          ...item,
          id: item.id || `local-${Date.now()}-${Math.random()}`,
          isLocal: true, // Flag for UI
        };
        
        destination.activities.push(newItem);
        
        // Force update reference to trigger re-renders if needed (Immer handles this usually)
      }
    },
    updateDayIds(
      state, 
      action: PayloadAction<Record<number, string>>
    ) {
        const dayIdMap = action.payload;
        if (!dayIdMap) return;

        state.destinations = state.destinations.map(d => {
            if (dayIdMap[d.day]) {
                return { ...d, id: dayIdMap[d.day] };
            }
            return d;
        });

        if (state.selectedDestination) {
            // (Keep selection logic if needed, or rely on activeItemId)
        }
    },
    setHoveredItemId(state, action: PayloadAction<string | null>) {
      state.hoveredItemId = action.payload;
    },
    setActiveItemId(state, action: PayloadAction<string | null>) {
      state.activeItemId = action.payload;
      // Also focus it if activated
      if (action.payload) {
        state.focusedItemId = action.payload;
      }
    },
    setFocusedItemId(state, action: PayloadAction<string | null>) {
      state.focusedItemId = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder.addCase(toolCallReceived, (state, action: PayloadAction<ToolCallEvent>) => {
      if (action.payload.state !== 'result' || !action.payload.result) return;

      const result = action.payload.result as Record<string, unknown>;

      if (
        action.payload.toolName === 'flyToLocation' &&
        result.success &&
        typeof result.lat === 'number' &&
        typeof result.lng === 'number'
      ) {
        state.visualTarget = {
          lat: result.lat,
          lng: result.lng,
          height: typeof result.height === 'number' ? result.height : 500000,
        };
      }

      if (
        action.payload.toolName === 'generateItinerary' &&
        result.success &&
        result.plan
      ) {
        const resultTripId =
          typeof (result as { tripId?: unknown }).tripId === 'string'
            ? ((result as { tripId: string }).tripId)
            : null;
        if (resultTripId && state.tripId && resultTripId !== state.tripId) {
          return;
        }
        if (resultTripId && !state.tripId) {
          state.tripId = resultTripId;
        }
        applyPlan(state, result.plan as ItineraryPlan);
        if (Array.isArray(result.hostMarkers)) {
          state.hostMarkers = result.hostMarkers as HostMarkerData[];
        }
      }

      if (action.payload.toolName === 'resolve_place') {
        const data =
          result && typeof result.data === 'object' && result.data
            ? (result.data as Record<string, unknown>)
            : result;
        const location = data.location as { lat?: number; lng?: number } | undefined;
        if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
          return;
        }

        const confidence =
          typeof data.confidence === 'number' ? data.confidence : 1;
        if (confidence < 0.6) {
          return;
        }

        const distanceToAnchor =
          typeof data.distanceToAnchor === 'number' ? data.distanceToAnchor : null;
        if (distanceToAnchor !== null && distanceToAnchor > MAX_PLACE_DISTANCE_METERS) {
          return;
        }

        const category = typeof data.category === 'string' ? data.category : undefined;
        if (category === 'country') {
          return;
        }

        const marker: PlaceMarkerData = {
          id: typeof data.id === 'string' ? data.id : action.payload.id,
          name: typeof data.name === 'string' ? data.name : 'Location',
          lat: location.lat,
          lng: location.lng,
          category,
          confidence,
        };

        const index = state.placeMarkers.findIndex((item) => item.id === marker.id);
        if (index >= 0) {
          state.placeMarkers[index] = marker;
        } else {
          state.placeMarkers.push(marker);
        }
        if (state.placeMarkers.length > 50) {
          state.placeMarkers.shift();
        }
      }
    });
  },
});

export const {
  setTripId,
  setVisualTarget,
  setCameraHeight,
  clearVisualTarget,
  setDestinations,
  setRoutes,
  setRouteMarkers,
  setSelectedDestination,
  setSelectedHostId,
  clearSelectedHostId,
  setSelectedExperienceId,
  clearSelectedExperienceId,
  setHostMarkers,
  setPlannerHosts,
  setPlannerHostsStatus,
  clearPlannerHosts,
  addHostMarkers,
  clearHostMarkers,
  setPlaceMarkers,
  addPlaceMarker,
  clearPlaceMarkers,
  clearItinerary,
  setItineraryFromPlan,
  setItineraryData,
  hydrateGlobeState,
  addLocalExperience,
  updateDayIds,
  setHoveredItemId,
  setActiveItemId,
  setFocusedItemId
} = globeSlice.actions;

export default globeSlice.reducer;
