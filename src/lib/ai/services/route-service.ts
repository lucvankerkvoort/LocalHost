/**
 * Route Service
 * 
 * Fetches driving route polylines from OSRM for corridor validation.
 * Used to verify that road trip waypoints stay within the expected route corridor.
 */

import type { GeoPoint } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface RouteResult {
  /** Array of points along the route */
  polyline: GeoPoint[];
  
  /** Total route distance in meters */
  distanceMeters: number;
  
  /** Estimated driving duration in seconds */
  durationSeconds: number;
  
  /** Route name/summary (if available) */
  summary?: string;
}

// ============================================================================
// Cache
// ============================================================================

const ROUTE_CACHE = new Map<string, RouteResult>();

function getCacheKey(origin: GeoPoint, terminus: GeoPoint): string {
  return `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}|${terminus.lat.toFixed(4)},${terminus.lng.toFixed(4)}`;
}

// ============================================================================
// OSRM API
// ============================================================================

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

interface OSRMResponse {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: {
      type: 'LineString';
      coordinates: Array<[number, number]>; // [lng, lat]
    };
  }>;
}

/**
 * Fetch a driving route polyline from OSRM.
 * 
 * @param origin - Starting point
 * @param terminus - Ending point
 * @param options - Additional options
 * @returns Route result with polyline, or null if route not found
 */
export async function fetchRoutePolyline(
  origin: GeoPoint,
  terminus: GeoPoint,
  options?: { skipCache?: boolean }
): Promise<RouteResult | null> {
  // Check cache first
  const cacheKey = getCacheKey(origin, terminus);
  if (!options?.skipCache && ROUTE_CACHE.has(cacheKey)) {
    console.log(`[RouteService] Cache hit for route`);
    return ROUTE_CACHE.get(cacheKey)!;
  }

  try {
    // OSRM expects coordinates as lng,lat
    const url = `${OSRM_BASE_URL}/${origin.lng},${origin.lat};${terminus.lng},${terminus.lat}?overview=full&geometries=geojson`;
    
    console.log(`[RouteService] Fetching route from OSRM...`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'LocalhostTravelApp/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`[RouteService] OSRM API error: ${response.status}`);
      return null;
    }

    const data: OSRMResponse = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.warn(`[RouteService] No route found: ${data.code}`);
      return null;
    }

    const route = data.routes[0];
    
    // Convert GeoJSON coordinates [lng, lat] to our GeoPoint format
    const polyline: GeoPoint[] = route.geometry.coordinates.map(([lng, lat]) => ({
      lat,
      lng,
    }));

    const result: RouteResult = {
      polyline,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
    };

    // Cache the result
    ROUTE_CACHE.set(cacheKey, result);
    
    console.log(`[RouteService] Route fetched: ${Math.round(route.distance / 1609.34)} miles, ${polyline.length} points`);

    return result;
  } catch (error) {
    console.error(`[RouteService] Error fetching route:`, error);
    return null;
  }
}

/**
 * Fetch route polyline through multiple waypoints.
 * 
 * @param waypoints - Array of points (origin, intermediate stops, terminus)
 * @returns Combined route result, or null if any segment fails
 */
export async function fetchRouteWithWaypoints(
  waypoints: GeoPoint[]
): Promise<RouteResult | null> {
  if (waypoints.length < 2) {
    return null;
  }

  try {
    // Build coordinate string for OSRM
    const coordString = waypoints
      .map(p => `${p.lng},${p.lat}`)
      .join(';');

    const url = `${OSRM_BASE_URL}/${coordString}?overview=full&geometries=geojson`;
    
    console.log(`[RouteService] Fetching multi-waypoint route (${waypoints.length} points)...`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'LocalhostTravelApp/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`[RouteService] OSRM API error: ${response.status}`);
      return null;
    }

    const data: OSRMResponse = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.warn(`[RouteService] No route found: ${data.code}`);
      return null;
    }

    const route = data.routes[0];
    
    const polyline: GeoPoint[] = route.geometry.coordinates.map(([lng, lat]) => ({
      lat,
      lng,
    }));

    return {
      polyline,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
    };
  } catch (error) {
    console.error(`[RouteService] Error fetching multi-waypoint route:`, error);
    return null;
  }
}

/**
 * Calculate the perpendicular distance from a point to the nearest segment of a polyline.
 * Used for corridor adherence validation.
 * 
 * @param point - The point to check
 * @param polyline - The route polyline
 * @returns Distance in meters to the nearest point on the polyline
 */
export function distanceToPolyline(point: GeoPoint, polyline: GeoPoint[]): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) {
    return haversineDistance(point.lat, point.lng, polyline[0].lat, polyline[0].lng);
  }

  let minDistance = Infinity;

  for (let i = 0; i < polyline.length - 1; i++) {
    const segmentStart = polyline[i];
    const segmentEnd = polyline[i + 1];
    
    // Calculate distance to this segment
    const distance = distanceToSegment(point, segmentStart, segmentEnd);
    
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Haversine distance between two points in meters.
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate perpendicular distance from a point to a line segment.
 * Uses projection onto the segment.
 */
function distanceToSegment(point: GeoPoint, segStart: GeoPoint, segEnd: GeoPoint): number {
  // Convert to simple Cartesian (good enough for short segments)
  const px = point.lng;
  const py = point.lat;
  const ax = segStart.lng;
  const ay = segStart.lat;
  const bx = segEnd.lng;
  const by = segEnd.lat;

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;

  const ab2 = abx * abx + aby * aby;
  
  if (ab2 === 0) {
    // Segment has zero length, use distance to point
    return haversineDistance(point.lat, point.lng, segStart.lat, segStart.lng);
  }

  // Calculate projection parameter
  let t = (apx * abx + apy * aby) / ab2;
  
  // Clamp to segment
  t = Math.max(0, Math.min(1, t));

  // Find the closest point on the segment
  const closestLng = ax + t * abx;
  const closestLat = ay + t * aby;

  return haversineDistance(point.lat, point.lng, closestLat, closestLng);
}

/**
 * Clear the route cache (useful for testing).
 */
export function clearRouteCache(): void {
  ROUTE_CACHE.clear();
}
