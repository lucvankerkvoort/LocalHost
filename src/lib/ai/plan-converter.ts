/**
 * Orchestrator Plan Converter
 * 
 * Converts AI orchestrator output to globe visualization types.
 */

import { GlobeDestination, RouteMarkerData, TravelRoute, generateId, getColorForDay } from '@/types/globe';
import { createItem, ItineraryItem } from '@/types/itinerary';
import type { ItineraryPlan as OrchestratorPlan } from '@/lib/ai/types';

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

  const isValidCoordinate = (lat: number, lng: number) =>
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0);

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
    // Create destination from anchor location
    const destination: GlobeDestination = {
      id: generateId(),
      name: day.title,
      lat: anchorLocation.location.lat,
      lng: anchorLocation.location.lng,
      day: day.dayNumber,
      activities: day.activities.map((act, idx): ItineraryItem =>
        createItem('activity', act.place.name, idx, {
          description: act.notes,
          location: act.place.description || act.place.address || `${act.timeSlot}`,
        })
      ),
      color: getColorForDay(day.dayNumber),
      suggestedHosts: day.suggestedHosts,
      city: extractCityName(anchorLocation),
    };
    destinations.push(destination);

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
          addRouteMarker(routeId, 'start', fromActivity.place, day.dayNumber);
          addRouteMarker(routeId, 'end', toActivity.place, day.dayNumber);
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
