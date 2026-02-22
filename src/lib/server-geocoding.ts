type GooglePlacesTextSearchResponse = {
  places?: Array<{
    location?: {
      latitude?: number;
      longitude?: number;
    };
  }>;
};

function resolveGoogleApiKey(): string | null {
  const key =
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

export async function geocodeCity(city: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = resolveGoogleApiKey();
  if (!apiKey) {
    console.warn('[geocodeCity] GOOGLE_PLACES_API_KEY is not configured');
    return null;
  }

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.location',
      },
      cache: 'no-store',
      body: JSON.stringify({
        textQuery: city,
        pageSize: 1,
      }),
    });

    if (!response.ok) {
      console.warn(`[geocodeCity] Google Places failed for "${city}"`, response.status, response.statusText);
      return null;
    }

    const payload = (await response.json()) as GooglePlacesTextSearchResponse;
    const location = payload.places?.[0]?.location;
    if (
      location &&
      typeof location.latitude === 'number' &&
      typeof location.longitude === 'number'
    ) {
      return {
        lat: location.latitude,
        lng: location.longitude,
      };
    }

    return null;
  } catch (error) {
    console.error('[geocodeCity] error', error);
    return null;
  }
}

