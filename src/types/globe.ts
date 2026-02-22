import { ItineraryItem } from './itinerary';

export interface HostMarkerData {
  id: string;
  hostId?: string;
  name: string;
  lat: number;
  lng: number;
  photo?: string;
  headline?: string;
  rating?: number;
  experienceCount?: number;
}

export interface PlaceMarkerData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
  confidence?: number;
}

export interface RouteMarkerData {
  id: string;
  routeId: string;
  kind: 'start' | 'end';
  lat: number;
  lng: number;
  name?: string;
  dayNumber?: number; // Day this marker belongs to (for filtering)
}

export type AnchorType = 'CITY' | 'REGION' | 'ROAD_TRIP' | 'TRAIL';

export interface AnchorLocation {
  name: string;
  lat: number;
  lng: number;
  placeId?: string;
}

export interface GlobeDestination {
  id: string;
  name: string; // The Anchor Title
  lat: number;  // Center/Primary Latitude
  lng: number;  // Center/Primary Longitude
  
  type?: AnchorType;
  locations?: AnchorLocation[];
  
  day: number;
  date?: string;
  activities: ItineraryItem[];
  color: string;
  suggestedHosts?: unknown[];
  city?: string;
}

export interface CityMarkerData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  dayIds: string[];
  dayNumbers: number[];
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
  mode: 'flight' | 'train' | 'drive' | 'boat' | 'walk';
  path?: Array<{ lat: number; lng: number }>;
  distanceMeters?: number;
  durationSeconds?: number;
  pathSource?: 'google' | 'fallback';
  dayNumber?: number; // Day this route belongs to (for filtering by selected day)
}

export interface GlobeItinerary {
  id: string;
  title: string;
  destinations: GlobeDestination[];
  routes: TravelRoute[];
  routeMarkers?: RouteMarkerData[];
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
import { createItem } from './itinerary';

export const SAMPLE_DESTINATIONS: GlobeDestination[] = [
  {
    id: 'tokyo',
    name: 'Tokyo',
    lat: 35.6762,
    lng: 139.6503,
    type: 'CITY',
    locations: [{ name: 'Tokyo', lat: 35.6762, lng: 139.6503 }],
    day: 1,
    activities: [
      createItem('TRANSPORT', 'Arrive at Narita', 0),
      createItem('LODGING', 'Check in to hotel', 1),
      createItem('SIGHT', 'Explore Shibuya', 2)
    ],
    color: DAY_COLORS[0],
  },
  {
    id: 'kyoto',
    name: 'Kyoto',
    lat: 35.0116,
    lng: 135.7681,
    type: 'CITY',
    locations: [{ name: 'Kyoto', lat: 35.0116, lng: 135.7681 }],
    day: 3,
    activities: [
      createItem('SIGHT', 'Fushimi Inari', 0),
      createItem('SIGHT', 'Kinkaku-ji Temple', 1),
      createItem('MEAL', 'Gion district dinner', 2)
    ],
    color: DAY_COLORS[2],
  },
  {
    id: 'osaka',
    name: 'Osaka',
    lat: 34.6937,
    lng: 135.5023,
    type: 'CITY',
    locations: [{ name: 'Osaka', lat: 34.6937, lng: 135.5023 }],
    day: 5,
    activities: [
      createItem('SIGHT', 'Dotonbori', 0),
      createItem('SIGHT', 'Osaka Castle', 1),
      createItem('MEAL', 'Street food tour', 2)
    ],
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
