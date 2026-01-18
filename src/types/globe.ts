// Globe itinerary types for Resium/CesiumJS visualization

export interface GlobeDestination {
  id: string;
  name: string;
  lat: number;
  lng: number;
  day: number;
  activities: string[];
  color: string;
}

export interface TravelRoute {
  id: string;
  fromId: string;
  toId: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  mode: 'flight' | 'train' | 'drive' | 'walk';
}

export interface GlobeItinerary {
  id: string;
  title: string;
  destinations: GlobeDestination[];
  routes: TravelRoute[];
  createdAt: string;
}

// Helper to generate unique IDs
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Color palette for destinations by day
export const DAY_COLORS = [
  '#fb8500', // Day 1 - Princeton Orange
  '#219ebc', // Day 2 - Blue Green
  '#8ecae6', // Day 3 - Sky Blue
  '#ffb703', // Day 4 - Amber
  '#023047', // Day 5 - Deep Space Blue
  '#e63946', // Day 6 - Red
  '#2a9d8f', // Day 7 - Teal
  '#9b5de5', // Day 8 - Purple
];

export function getColorForDay(day: number): string {
  return DAY_COLORS[(day - 1) % DAY_COLORS.length];
}

// Sample destinations for testing
export const SAMPLE_DESTINATIONS: GlobeDestination[] = [
  {
    id: 'tokyo',
    name: 'Tokyo',
    lat: 35.6762,
    lng: 139.6503,
    day: 1,
    activities: ['Arrive at Narita', 'Check in to hotel', 'Explore Shibuya'],
    color: DAY_COLORS[0],
  },
  {
    id: 'kyoto',
    name: 'Kyoto',
    lat: 35.0116,
    lng: 135.7681,
    day: 3,
    activities: ['Fushimi Inari', 'Kinkaku-ji Temple', 'Gion district'],
    color: DAY_COLORS[2],
  },
  {
    id: 'osaka',
    name: 'Osaka',
    lat: 34.6937,
    lng: 135.5023,
    day: 5,
    activities: ['Dotonbori', 'Osaka Castle', 'Street food tour'],
    color: DAY_COLORS[4],
  },
];

export const SAMPLE_ROUTES: TravelRoute[] = [
  {
    id: 'tokyo-kyoto',
    fromId: 'tokyo',
    toId: 'kyoto',
    fromLat: 35.6762,
    fromLng: 139.6503,
    toLat: 35.0116,
    toLng: 135.7681,
    mode: 'train',
  },
  {
    id: 'kyoto-osaka',
    fromId: 'kyoto',
    toId: 'osaka',
    fromLat: 35.0116,
    fromLng: 135.7681,
    toLat: 34.6937,
    toLng: 135.5023,
    mode: 'train',
  },
];
