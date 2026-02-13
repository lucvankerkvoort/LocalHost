/**
 * Orchestrator Plan Converter
 * 
 * Converts AI orchestrator output to globe visualization types.
 */

import { GlobeDestination, RouteMarkerData, TravelRoute, generateId, getColorForDay, HostMarkerData } from '@/types/globe';
import { createItem, ItineraryItem, ItineraryItemType } from '@/types/itinerary';
import type { ItineraryPlan as OrchestratorPlan } from '@/lib/ai/types';
import { isObviouslyInvalid } from '@/lib/ai/validation/geo-validator';

/**
 * Convert an orchestrator ItineraryPlan to globe visualization data.
 * Extracts destinations (day anchors) and routes (navigation between activities).
 */
export function convertPlanToGlobeData(plan: OrchestratorPlan): {
  destinations: GlobeDestination[];
  routes: TravelRoute[];
  routeMarkers: RouteMarkerData[];
} {
  const destinations: GlobeDestination[] = [];
  const routes: TravelRoute[] = [];
  const routeMarkers: RouteMarkerData[] = [];

  // Use centralized geo-validator for coordinate validation
  const isValidCoordinate = (lat: number, lng: number) => !isObviouslyInvalid(lat, lng);

  const addRouteMarker = (
    routeId: string,
    kind: RouteMarkerData['kind'],
    place: { name: string; location: { lat: number; lng: number } },
    dayNumber?: number
  ) => {
    const { lat, lng } = place.location;
    if (!isValidCoordinate(lat, lng)) return;
    routeMarkers.push({
      id: `${routeId}-${kind}`,
      routeId,
      kind,
      lat,
      lng,
      name: place.name,
      dayNumber,
    });
  };

  const extractCityName = (place: {
    name: string;
    description?: string;
    address?: string;
    city?: string;
  }): string | undefined => {
    if (place.city) return place.city;
    const source = place.address || place.description;
    if (!source) return undefined;
    const parts = source.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) return undefined;
    const candidates = parts.length > 2 ? parts.slice(0, -1) : parts;
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const cleaned = candidates[i]
        .replace(/\d+/g, '')
        .replace(/\b[A-Z]{1,3}\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned) return cleaned;
    }
    return undefined;
  };

  // Process each day
  for (const day of plan.days) {
    // Skip days without valid anchor location
    if (!day.anchorLocation?.location) {
      continue;
    }
    const anchorLocation = day.anchorLocation;
    // Prefer explicit city from AI, fallback to extraction
    const currentCity = day.city || extractCityName(anchorLocation);

    console.log(`[PlanConverter] Day ${day.dayNumber}: currentCity="${currentCity}" (explicit: ${day.city})`);

    // Create items first to preserve IDs
    const dayItems = day.activities.map((act, idx): ItineraryItem => {
      // ... (existing mapping logic) ...
        // Map category to item type
        let type: ItineraryItemType = 'EXPERIENCE'; // Default to Anchor/Experience
        const cat = act.place.category?.toLowerCase();
        
        if (cat === 'landmark' || cat === 'museum' || cat === 'park' || cat === 'sight') {
            type = 'SIGHT'; // Context Stop
        } else if (cat === 'restaurant' || cat === 'cafe' || cat === 'food') {
            type = 'MEAL';
        }

        // Assign a host if available and appropriate
        let hostId: string | undefined;
        if ((type === 'EXPERIENCE' || type === 'MEAL') && day.suggestedHosts && day.suggestedHosts.length > 0) {
            // Simple logic: cycle through hosts based on index to distribute them
            const hostIndex = idx % day.suggestedHosts.length;
            hostId = day.suggestedHosts[hostIndex].id;
        }

        return createItem(type, act.place.name, idx, {
          description: act.notes,
          location: act.place.description || act.place.address || `${act.timeSlot}`,
          place: {
            id: act.place.id || `place-${idx}`,
            name: act.place.name,
            location: act.place.location
          },
          category: act.place.category, // Use place category
          hostId, // Assign the host
        });
    });

    // MARKER CONSOLIDATION LOGIC:
    // DISABLED: We want each day to be a distinct column in the UI.
    // The globe component handles visual clustering of markers sharing the same city.
    
    // Create NEW destination from anchor location (One destination per day)
    const destination: GlobeDestination = {
      id: generateId(),
      name: day.title,
      lat: anchorLocation.location.lat,
      lng: anchorLocation.location.lng,
      type: 'CITY',
      locations: [{
        name: currentCity || anchorLocation.name,
        lat: anchorLocation.location.lat,
        lng: anchorLocation.location.lng
      }],
      day: day.dayNumber,
      date: undefined, // Plan doesn't inherently have dates yet
      activities: dayItems,
      color: getColorForDay(day.dayNumber),
      suggestedHosts: [...(day.suggestedHosts || [])], // Clone array
      city: currentCity,
    };
    destinations.push(destination);

    // Add markers for ALL activities — use place.id as canonical ID for hover sync
    dayItems.forEach((item) => {
      if (item.place && item.place.location) {
        const { lat, lng } = item.place.location;
        if (isValidCoordinate(lat, lng)) {
            routeMarkers.push({
              id: item.place.id || item.id, // Prefer resolve_place OSM ID
              routeId: `full-day-${day.dayNumber}`,
              kind: 'end',
              lat,
              lng,
              name: item.place.name,
              dayNumber: day.dayNumber,
            });
        }
      }
    });

    // Extract navigation routes within this day
    if (day.navigationEvents && day.navigationEvents.length > 0) {
      for (const nav of day.navigationEvents) {
        // Find the from/to places in activities
        const fromActivity = day.activities.find(a => a.place.id === nav.fromPlaceId);
        const toActivity = day.activities.find(a => a.place.id === nav.toPlaceId);

        if (fromActivity && toActivity) {
          const routeId = generateId();
          routes.push({
            id: routeId,
            fromId: nav.fromPlaceId,
            toId: nav.toPlaceId,
            fromLat: fromActivity.place.location.lat,
            fromLng: fromActivity.place.location.lng,
            toLat: toActivity.place.location.lat,
            toLng: toActivity.place.location.lng,
            mode: nav.type === 'transit' ? 'train' : nav.type,
            dayNumber: day.dayNumber,
          });
          // NOTE: No addRouteMarker calls here — activity markers (above) already
          // cover these locations. Navigation events only need polylines.
        }
      }
    }
  }

  // Add routes between days (connecting last activity of day N to first activity of day N+1)
  for (let i = 0; i < plan.days.length - 1; i++) {
    const currentDay = plan.days[i];
    const nextDay = plan.days[i + 1];
    
    // Skip if either day lacks anchor location
    if (!currentDay.anchorLocation?.location || !nextDay.anchorLocation?.location) {
      continue;
    }
    
    const currentAnchor = currentDay.anchorLocation;
    const nextAnchor = nextDay.anchorLocation;

    // Use anchor locations for inter-day routes
    const routeId = generateId();
    routes.push({
      id: routeId,
      fromId: `day-${currentDay.dayNumber}-anchor`,
      toId: `day-${nextDay.dayNumber}-anchor`,
      fromLat: currentAnchor.location.lat,
      fromLng: currentAnchor.location.lng,
      toLat: nextAnchor.location.lat,
      toLng: nextAnchor.location.lng,
      mode: 'flight', // Default to flight for inter-day travel
    });
    addRouteMarker(routeId, 'start', currentAnchor, currentDay.dayNumber);
    addRouteMarker(routeId, 'end', nextAnchor, nextDay.dayNumber);
  }

  return { destinations, routes, routeMarkers };
}

/**
 * Map transportation mode from orchestrator to globe route mode
 */
export function mapTransportMode(mode: 'walk' | 'transit' | 'drive'): TravelRoute['mode'] {
  switch (mode) {
    case 'walk':
      return 'walk';
    case 'transit':
      return 'train';
    case 'drive':
      return 'drive';
    default:
      return 'walk';
  }
}

/**
 * Regenerate markers and simple routes from restored GlobeDestinations
 * (Used when loading from DB where detailed navigation events might be simplified)
 */
export function generateMarkersFromDestinations(destinations: GlobeDestination[]): {
  routeMarkers: RouteMarkerData[];
  hostMarkers: HostMarkerData[];
} {
  const routeMarkers: RouteMarkerData[] = [];
  const hostMarkers: HostMarkerData[] = [];
  const seenHostIds = new Set<string>();

  const isHostMarkerData = (value: unknown): value is HostMarkerData => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<HostMarkerData>;
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.name === 'string' &&
      typeof candidate.lat === 'number' &&
      typeof candidate.lng === 'number'
    );
  };

  const isValidCoordinate = (lat: number, lng: number) =>
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0);

  destinations.forEach(dest => {
    // 1. Collect Suggested Hosts
    if (dest.suggestedHosts && Array.isArray(dest.suggestedHosts)) {
      dest.suggestedHosts.forEach((host) => {
        if (!isHostMarkerData(host)) return;
        if (!seenHostIds.has(host.id)) {
          seenHostIds.add(host.id);
          hostMarkers.push(host);
        }
      });
    }

    // 2. Generate Route Markers for Activities
    dest.activities.forEach(act => {
      if (act.place && act.place.location) {
        const { lat, lng } = act.place.location;
        if (isValidCoordinate(lat, lng)) {
          routeMarkers.push({
            id: act.place.id || act.id, // Same ID scheme as convertPlanToGlobeData for hover sync
            routeId: `route-${dest.id}`, // grouping by day/destination
            kind: 'end',
            lat,
            lng,
            name: act.place.name,
            dayNumber: dest.day
          });
        }
      }
    });
  });

  return { routeMarkers, hostMarkers };
}

/**
 * Calculate center point from multiple coordinates (for camera positioning)
 */
export function getCenterPoint(destinations: GlobeDestination[]): { lat: number; lng: number } | null {
  if (destinations.length === 0) return null;

  const sumLat = destinations.reduce((sum, d) => sum + d.lat, 0);
  const sumLng = destinations.reduce((sum, d) => sum + d.lng, 0);

  return {
    lat: sumLat / destinations.length,
    lng: sumLng / destinations.length,
  };
}
