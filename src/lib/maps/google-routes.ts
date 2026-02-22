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
      console.warn('[google-routes] computeRoutes failed', response.status, response.statusText);
      return buildFallbackPath(from, to);
    }

    const payload = (await response.json()) as GoogleRouteResponse;
    const route = payload.routes?.[0];
    const encoded = route?.polyline?.encodedPolyline;
    if (!encoded || typeof encoded !== 'string') {
      return buildFallbackPath(from, to);
    }

    const points = decodePolyline(encoded);
    if (points.length < 2) {
      return buildFallbackPath(from, to);
    }

    return {
      points,
      distanceMeters: typeof route?.distanceMeters === 'number' ? route.distanceMeters : null,
      durationSeconds: decodeDurationSeconds(route?.duration),
      source: 'google',
    };
  } catch (error) {
    console.warn('[google-routes] computeRoutes exception', error);
    return buildFallbackPath(from, to);
  }
}

