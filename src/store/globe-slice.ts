import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { createSelector } from 'reselect';

import type { GlobeDestination, RouteMarkerData, TravelRoute, HostMarkerData, PlaceMarkerData } from '@/types/globe';
import type { ItineraryPlan } from '@/lib/ai/types';
import type { ItineraryItem } from '@/types/itinerary';
import type { ExperienceCategory } from '@/types';
import type { HostWithLocation } from './hosts-slice';
import { convertPlanToGlobeData } from '@/lib/ai/plan-converter';
import { toolCallReceived, type ToolCallEvent } from './tool-calls-slice';

const MAX_PLACE_DISTANCE_METERS = 300000;

export type PlanningViewMode = 'MAP' | 'LIST';

export interface PlanningActiveFilters {
  query: string;
  categories: ExperienceCategory[];
  minRating: number | null;
  maxPriceCents: number | null;
}

const createDefaultActiveFilters = (): PlanningActiveFilters => ({
  query: '',
  categories: [],
  minRating: null,
  maxPriceCents: null,
});

type LocalExperienceDraft = {
  type?: string;
  title?: string;
  id?: string;
  position?: number;
} & Record<string, unknown>;
type LocalItemType = ItineraryItem['type'];

interface GlobeState {
  tripId: string | null;
  visualTarget: { lat: number; lng: number; height?: number } | null;
  destinations: GlobeDestination[];
  routes: TravelRoute[];
  routeMarkers: RouteMarkerData[];
  selectedDestination: string | null;
  hostMarkers: HostMarkerData[];
  placeMarkers: PlaceMarkerData[];
  // Sync state for list <-> map interaction
  hoveredItemId: string | null;
  activeItemId: string | null;
  focusedItemId: string | null;
  planningViewMode: PlanningViewMode;
  selectedHostId: string | null;
  selectedExperienceId: string | null;
  activeFilters: PlanningActiveFilters;
}

const initialState: GlobeState = {
  tripId: null,
  visualTarget: null,
  destinations: [],
  routes: [],
  routeMarkers: [],
  selectedDestination: null,
  hostMarkers: [],
  placeMarkers: [],
  hoveredItemId: null,
  activeItemId: null,
  focusedItemId: null,
  planningViewMode: 'MAP',
  selectedHostId: null,
  selectedExperienceId: null,
  activeFilters: createDefaultActiveFilters(),
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
    setHostMarkers(state, action: PayloadAction<HostMarkerData[]>) {
      state.hostMarkers = action.payload;
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
      state.hostMarkers = [];
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
      state.routeMarkers = action.payload.routeMarkers ?? [];
      state.selectedDestination =
        action.payload.selectedDestinationId ??
        action.payload.destinations[0]?.id ??
        null;
      state.visualTarget = null;
      state.placeMarkers = [];
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
        state.routeMarkers = action.payload.routeMarkers;
      }
      if (Object.prototype.hasOwnProperty.call(action.payload, 'selectedDestination')) {
        state.selectedDestination = action.payload.selectedDestination ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(action.payload, 'visualTarget')) {
        state.visualTarget = action.payload.visualTarget ?? null;
      }
      if (action.payload.hostMarkers) {
        state.hostMarkers = action.payload.hostMarkers;
      }
      if (action.payload.placeMarkers) {
        state.placeMarkers = action.payload.placeMarkers;
      }
    },
    addLocalExperience(
      state,
      action: PayloadAction<{ dayNumber: number; item: LocalExperienceDraft }>
    ) {
      const { dayNumber, item } = action.payload;
      const destination = state.destinations.find((d) => d.day === dayNumber);
      if (destination) {
        // Ensure activities array exists
        if (!destination.activities) destination.activities = [];
        
        // Add item with temporary ID if needed
        const inferredType = (item.type as LocalItemType | undefined) ?? 'EXPERIENCE';
        const inferredTitle =
          typeof item.title === 'string' && item.title.length > 0
            ? item.title
            : 'Local Activity';
        const inferredPosition =
          typeof item.position === 'number'
            ? item.position
            : destination.activities.length;

        const newItem = {
          ...item,
          id: item.id || `local-${Date.now()}-${Math.random()}`,
          type: inferredType,
          title: inferredTitle,
          position: inferredPosition,
          isLocal: true, // Flag for UI
        } as ItineraryItem & { isLocal: true };

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
    },
    setPlanningViewMode(state, action: PayloadAction<PlanningViewMode>) {
      state.planningViewMode = action.payload;
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
    setActiveFilters(state, action: PayloadAction<PlanningActiveFilters>) {
      state.activeFilters = action.payload;
    },
    patchActiveFilters(state, action: PayloadAction<Partial<PlanningActiveFilters>>) {
      state.activeFilters = {
        ...state.activeFilters,
        ...action.payload,
      };
    },
    resetActiveFilters(state) {
      state.activeFilters = createDefaultActiveFilters();
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
  clearVisualTarget,
  setDestinations,
  setRoutes,
  setRouteMarkers,
  setSelectedDestination,
  setHostMarkers,
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
  setFocusedItemId,
  setPlanningViewMode,
  setSelectedHostId,
  clearSelectedHostId,
  setSelectedExperienceId,
  clearSelectedExperienceId,
  setActiveFilters,
  patchActiveFilters,
  resetActiveFilters,
} = globeSlice.actions;

const selectGlobeState = (state: { globe: GlobeState }) => state.globe;
const selectHostsState = (state: { hosts: { allHosts: HostWithLocation[] } }) => state.hosts.allHosts;

export const selectPlanningViewMode = createSelector(
  [selectGlobeState],
  (globe) => globe.planningViewMode
);

export const selectSelectedHostId = createSelector(
  [selectGlobeState],
  (globe) => globe.selectedHostId
);

export const selectSelectedExperienceId = createSelector(
  [selectGlobeState],
  (globe) => globe.selectedExperienceId
);

export const selectActiveFilters = createSelector(
  [selectGlobeState],
  (globe) => globe.activeFilters
);

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function experienceMatchesFilters(
  title: string,
  category: ExperienceCategory,
  rating: number,
  price: number,
  filters: PlanningActiveFilters
): boolean {
  if (filters.categories.length > 0 && !filters.categories.includes(category)) {
    return false;
  }
  if (filters.minRating !== null && rating < filters.minRating) {
    return false;
  }
  if (filters.maxPriceCents !== null && price > filters.maxPriceCents) {
    return false;
  }
  if (filters.query) {
    const query = normalizeText(filters.query);
    if (!normalizeText(title).includes(query)) {
      return false;
    }
  }
  return true;
}

export const selectVisibleHostIds = createSelector(
  [selectGlobeState, selectHostsState],
  (globe, allHosts) => {
    const filters = globe.activeFilters;
    const query = normalizeText(filters.query);
    const byId = new Map(allHosts.map((host) => [host.id, host]));

    return globe.hostMarkers
      .filter((marker) => {
        const hostId = marker.hostId || marker.id;
        const host = byId.get(hostId);
        const hostExperiences = host?.experiences ?? [];

        if (query) {
          const markerMatches =
            normalizeText(marker.name).includes(query) ||
            normalizeText(host?.city ?? '').includes(query) ||
            normalizeText(host?.country ?? '').includes(query);
          const experienceMatchesQuery = hostExperiences.some((experience) =>
            normalizeText(experience.title).includes(query)
          );
          if (!markerMatches && !experienceMatchesQuery) {
            return false;
          }
        }

        if (filters.minRating !== null) {
          const hostRating =
            marker.rating ??
            hostExperiences.reduce((max, experience) => Math.max(max, experience.rating), 0);
          if (hostRating < filters.minRating) {
            return false;
          }
        }

        if (filters.categories.length > 0 || filters.maxPriceCents !== null) {
          if (!host || hostExperiences.length === 0) {
            return false;
          }
          const matchingExperience = hostExperiences.some((experience) =>
            experienceMatchesFilters(
              experience.title,
              experience.category,
              experience.rating,
              experience.price,
              { ...filters, query: '' }
            )
          );
          if (!matchingExperience) {
            return false;
          }
        }

        return true;
      })
      .map((marker) => marker.hostId || marker.id);
  }
);

export const selectVisibleExperienceIds = createSelector(
  [selectVisibleHostIds, selectActiveFilters, selectHostsState],
  (visibleHostIds, filters, allHosts) => {
    if (visibleHostIds.length === 0) {
      return [];
    }
    const visibleHostSet = new Set(visibleHostIds);
    const seenExperienceIds = new Set<string>();
    const visibleExperienceIds: string[] = [];

    for (const host of allHosts) {
      if (!visibleHostSet.has(host.id)) continue;

      for (const experience of host.experiences) {
        if (
          experienceMatchesFilters(
            experience.title,
            experience.category,
            experience.rating,
            experience.price,
            filters
          ) &&
          !seenExperienceIds.has(experience.id)
        ) {
          seenExperienceIds.add(experience.id);
          visibleExperienceIds.push(experience.id);
        }
      }
    }

    return visibleExperienceIds;
  }
);

export default globeSlice.reducer;
