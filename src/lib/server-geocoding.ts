export async function geocodeCity(city: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const encodedCity = encodeURIComponent(city);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedCity}&format=json&limit=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'LocalHost-Platform/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`Geocoding failed for ${city}: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }

    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}
