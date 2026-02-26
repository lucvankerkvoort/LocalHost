export type RouteMode = 'flight' | 'train' | 'drive' | 'boat' | 'walk';

export type RoutePoint = {
  lat: number;
  lng: number;
};

export type RoutePathResult = {
  points: RoutePoint[];
  distanceMeters: number | null;
  durationSeconds: number | null;
  source: 'google' | 'fallback';
};

type GoogleRouteResponse = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    polyline?: {
      encodedPolyline?: string;
    };
  }>;
};

function decodeDurationSeconds(duration?: string): number | null {
  if (!duration) return null;
  const trimmed = duration.trim();
  if (!trimmed.endsWith('s')) return null;
  const value = Number(trimmed.slice(0, -1));
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function decodePolyline(encoded: string): RoutePoint[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: RoutePoint[] = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }

  return coordinates;
}

function buildFallbackPath(from: RoutePoint, to: RoutePoint): RoutePathResult {
  return {
    points: [from, to],
    distanceMeters: null,
    durationSeconds: null,
    source: 'fallback',
  };
}

function mapRouteMode(mode: RouteMode): 'DRIVE' | 'TRANSIT' | 'WALK' | null {
  switch (mode) {
    case 'drive':
      return 'DRIVE';
    case 'train':
      return 'TRANSIT';
    case 'walk':
      return 'WALK';
    case 'boat':
    case 'flight':
      return null;
    default:
      return null;
  }
}

function resolveGoogleMapsApiKey(): string | null {
  const key =
    process.env.GOOGLE_ROUTES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRoute(
  from: RoutePoint,
  to: RoutePoint,
  googleMode: 'DRIVE' | 'TRANSIT' | 'WALK',
  apiKey: string
): Promise<RoutePathResult | null> {
  const body: Record<string, unknown> = {
    origin: {
      location: {
        latLng: {
          latitude: from.lat,
          longitude: from.lng,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: to.lat,
          longitude: to.lng,
        },
      },
    },
    travelMode: googleMode,
    polylineQuality: 'OVERVIEW',
    polylineEncoding: 'ENCODED_POLYLINE',
    computeAlternativeRoutes: false,
  };

  if (googleMode === 'DRIVE') {
    body.routingPreference = 'TRAFFIC_AWARE_OPTIMAL';
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        },
        cache: 'no-store',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_RETRIES - 1) {
          const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          console.warn(`[google-routes] ${response.status} on attempt ${attempt + 1}, retrying in ${backoff}ms`);
          await delay(backoff);
          continue;
        }
        console.warn('[google-routes] computeRoutes failed', response.status, response.statusText);
        return null;
      }

      const payload = (await response.json()) as GoogleRouteResponse;
      const route = payload.routes?.[0];
      const encoded = route?.polyline?.encodedPolyline;
      if (!encoded || typeof encoded !== 'string') {
        return null;
      }

      const points = decodePolyline(encoded);
      if (points.length < 2) {
        return null;
      }

      return {
        points,
        distanceMeters: typeof route?.distanceMeters === 'number' ? route.distanceMeters : null,
        durationSeconds: decodeDurationSeconds(route?.duration),
        source: 'google',
      };
    } catch (error) {
      if (attempt < MAX_RETRIES - 1) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(`[google-routes] exception on attempt ${attempt + 1}, retrying in ${backoff}ms`, error);
        await delay(backoff);
        continue;
      }
      console.warn('[google-routes] computeRoutes failed after all retries', error);
      return null;
    }
  }

  return null;
}

export async function computeGoogleRoutePath(
  from: RoutePoint,
  to: RoutePoint,
  mode: RouteMode
): Promise<RoutePathResult> {
  const googleMode = mapRouteMode(mode);
  if (!googleMode) {
    return buildFallbackPath(from, to);
  }

  const apiKey = resolveGoogleMapsApiKey();
  if (!apiKey) {
    return buildFallbackPath(from, to);
  }

  // Try the requested mode first
  const result = await fetchRoute(from, to, googleMode, apiKey);
  if (result) return result;

  // If TRANSIT failed, retry with DRIVE — Google's transit data
  // is spotty in many regions (Alps, cross-border routes, etc.)
  if (googleMode === 'TRANSIT') {
    console.info('[google-routes] TRANSIT failed, retrying with DRIVE');
    const driveResult = await fetchRoute(from, to, 'DRIVE', apiKey);
    if (driveResult) return driveResult;
  }

  return buildFallbackPath(from, to);
}

