/**
 * City coordinates mapping for host geolocation.
 * Used to assign lat/lng to hosts based on their city.
 */
export const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  // Europe
  'Rome': { lat: 41.9028, lng: 12.4964 },
  'Barcelona': { lat: 41.3851, lng: 2.1734 },
  'Lisbon': { lat: 38.7223, lng: -9.1393 },
  'Paris': { lat: 48.8566, lng: 2.3522 },
  'London': { lat: 51.5074, lng: -0.1278 },
  'Amsterdam': { lat: 52.3676, lng: 4.9041 },
  'Berlin': { lat: 52.5200, lng: 13.4050 },
  'Prague': { lat: 50.0755, lng: 14.4378 },
  'Vienna': { lat: 48.2082, lng: 16.3738 },
  'Athens': { lat: 37.9838, lng: 23.7275 },
  
  // Asia
  'Kyoto': { lat: 35.0116, lng: 135.7681 },
  'Tokyo': { lat: 35.6762, lng: 139.6503 },
  'Osaka': { lat: 34.6937, lng: 135.5023 },
  'Bangkok': { lat: 13.7563, lng: 100.5018 },
  'Singapore': { lat: 1.3521, lng: 103.8198 },
  'Hong Kong': { lat: 22.3193, lng: 114.1694 },
  'Seoul': { lat: 37.5665, lng: 126.9780 },
  'Bali': { lat: -8.3405, lng: 115.0920 },
  'Hanoi': { lat: 21.0285, lng: 105.8542 },
  'Mumbai': { lat: 19.0760, lng: 72.8777 },
  
  // Americas
  'Mexico City': { lat: 19.4326, lng: -99.1332 },
  'New York': { lat: 40.7128, lng: -74.0060 },
  'Los Angeles': { lat: 34.0522, lng: -118.2437 },
  'San Francisco': { lat: 37.7749, lng: -122.4194 },
  'Buenos Aires': { lat: -34.6037, lng: -58.3816 },
  'Rio de Janeiro': { lat: -22.9068, lng: -43.1729 },
  'Lima': { lat: -12.0464, lng: -77.0428 },
  'Bogota': { lat: 4.7110, lng: -74.0721 },
  'Havana': { lat: 23.1136, lng: -82.3666 },
  
  // Africa & Middle East
  'Accra': { lat: 5.6037, lng: -0.1870 },
  'Cape Town': { lat: -33.9249, lng: 18.4241 },
  'Marrakech': { lat: 31.6295, lng: -7.9811 },
  'Cairo': { lat: 30.0444, lng: 31.2357 },
  'Dubai': { lat: 25.2048, lng: 55.2708 },
  'Tel Aviv': { lat: 32.0853, lng: 34.7818 },
  'Nairobi': { lat: -1.2921, lng: 36.8219 },
  'Lagos': { lat: 6.5244, lng: 3.3792 },
  'Istanbul': { lat: 41.0082, lng: 28.9784 },
  
  // Scandinavia
  'Stockholm': { lat: 59.3293, lng: 18.0686 },
  'Copenhagen': { lat: 55.6761, lng: 12.5683 },
  'Oslo': { lat: 59.9139, lng: 10.7522 },
  'Helsinki': { lat: 60.1699, lng: 24.9384 },
  
  // Oceania
  'Sydney': { lat: -33.8688, lng: 151.2093 },
  'Melbourne': { lat: -37.8136, lng: 144.9631 },
  'Auckland': { lat: -36.8485, lng: 174.7633 },
};

/**
 * Get coordinates for a city, with fallback to approximate geocoding.
 */
export function getCityCoordinates(city: string): { lat: number; lng: number } | null {
  // Try exact match first
  if (CITY_COORDINATES[city]) {
    return CITY_COORDINATES[city];
  }
  
  // Try case-insensitive match
  const lowerCity = city.toLowerCase();
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (key.toLowerCase() === lowerCity) {
      return coords;
    }
  }
  
  return null;
}
