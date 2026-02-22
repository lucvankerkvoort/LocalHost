import { GlobeDestination, getColorForDay } from '@/types/globe';
import { ItineraryItem } from '@/types/itinerary';

// Define partial types matching the Prisma response we expect
interface ApiItineraryItem {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status?: ItineraryItem['status'];
  experienceId: string | null;
  hostId?: string | null; // Some items may have hostId directly
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  orderIndex: number;
  experience?: {
      hostId: string;
  } | null;
  bookings?: ApiBooking[];
}

interface ApiBooking {
  id: string;
  status: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'PENDING';
  paymentStatus?: 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';
  updatedAt?: string | Date;
}

interface ApiItineraryDay {
  id: string;
  dayIndex: number; 
  title: string | null;
  items: ApiItineraryItem[]; // Update reference
  suggestedHosts?: unknown[];
}

export interface ApiTripAnchor {
  id: string;
  title: string;
  type?: 'CITY' | 'REGION' | 'ROAD_TRIP' | 'TRAIL';
  locations: Array<{
    name: string;
    lat: number;
    lng: number;
    placeId?: string;
  }>;
  days: ApiItineraryDay[];
}

export interface ApiTrip {
  id: string;
  userId: string;
  title: string;
  stops: ApiTripAnchor[];
  preferences?: Record<string, unknown> | null;
}

const ITINERARY_ITEM_TYPES: ItineraryItem['type'][] = [
  'SIGHT',
  'EXPERIENCE',
  'MEAL',
  'FREE_TIME',
  'TRANSPORT',
  'NOTE',
  'LODGING',
];

function normalizeItineraryType(type: string): ItineraryItem['type'] {
  const upper = type.toUpperCase();
  return ITINERARY_ITEM_TYPES.includes(upper as ItineraryItem['type'])
    ? (upper as ItineraryItem['type'])
    : 'SIGHT';
}

function deriveItineraryItemStatus(item: ApiItineraryItem): ItineraryItem['status'] {
  const bookings = item.bookings ?? [];

  if (bookings.some((booking) => booking.status === 'CONFIRMED' || booking.status === 'COMPLETED')) {
    return 'BOOKED';
  }

  const activeTentative = bookings.find(
    (booking) =>
      (booking.status === 'TENTATIVE' || booking.status === 'PENDING') &&
      booking.paymentStatus !== 'FAILED'
  );
  if (activeTentative) {
    return 'PENDING';
  }

  const latestBooking = bookings[0];
  if (latestBooking?.paymentStatus === 'FAILED') {
    return 'FAILED';
  }

  return item.status ?? 'DRAFT';
}

function deriveCandidateId(item: ApiItineraryItem): string | undefined {
  const bookings = item.bookings ?? [];
  const activeTentative = bookings.find(
    (booking) =>
      (booking.status === 'TENTATIVE' || booking.status === 'PENDING') &&
      booking.paymentStatus !== 'FAILED'
  );

  return activeTentative?.id;
}

export function convertTripToGlobeDestinations(trip: ApiTrip): GlobeDestination[] {
  const destinations: GlobeDestination[] = [];

  for (const stop of trip.stops) {
    // Determine primary location (first one)
    const primaryLoc = stop.locations?.[0] || { lat: 0, lng: 0, name: 'Unknown' };

    for (const day of stop.days) {
        const activities: ItineraryItem[] = day.items
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map(item => ({
                id: item.id,
                type: normalizeItineraryType(item.type), 
                category: item.type.toLowerCase(), 
                title: item.title,
                hostId: item.experience?.hostId || item.hostId || undefined, 
                experienceId: item.experienceId,
                status: deriveItineraryItemStatus(item),
                candidateId: deriveCandidateId(item),
                position: item.orderIndex,
                timeSlot: 'Flexible', 
                description: item.description || '',
                price: undefined,
                place: {
                    id: item.locationName ? `loc-${item.id}` : 'unknown',
                    name: item.locationName || primaryLoc.name,
                    location: {
                        lat: item.lat ?? primaryLoc.lat,
                        lng: item.lng ?? primaryLoc.lng,
                    }
                }
            } as ItineraryItem));

        destinations.push({
            id: day.id, 
            name: day.title || stop.title,
            lat: primaryLoc.lat,
            lng: primaryLoc.lng,
            type: stop.type || 'CITY',
            locations: stop.locations,
            day: day.dayIndex, 
            activities,
            color: getColorForDay(day.dayIndex),
            city: primaryLoc.name, // Legacy fallback
            suggestedHosts: day.suggestedHosts || [],
        });
    }
  }

  return destinations.sort((a, b) => a.day - b.day);
}

type ApiTripPayloadItem = {
  type: ItineraryItem['type'];
  title: string;
  description?: string | null;
  startTime: string | null;
  experienceId: string | null | undefined;
  locationName: string;
  lat?: number;
  lng?: number;
  orderIndex: number;
  createdByAI: boolean;
};

type ApiTripPayloadDay = {
  dayIndex: number;
  title: string;
  suggestedHosts: unknown[];
  items: ApiTripPayloadItem[];
};

type ApiTripPayloadStop = {
  title: string;
  type: ApiTripAnchor['type'];
  locations: ApiTripAnchor['locations'];
  order: number;
  days: ApiTripPayloadDay[];
};

type ApiTripPayload = {
  stops: ApiTripPayloadStop[];
};

export function convertGlobeDestinationsToApiPayload(destinations: GlobeDestination[]): ApiTripPayload {
  const mapItemType = (type: ItineraryItem['type'] | undefined) => {
    if (!type) return 'SIGHT';
    return type;
  };

  // 1. Group by City to reconstruct Stops
  const stops: ApiTripPayloadStop[] = [];
  let currentStop: ApiTripPayloadStop | null = null;

  // Ensure sorted by day
  const sortedDestinations = [...destinations].sort((a, b) => a.day - b.day);

  for (const dest of sortedDestinations) {
    const groupingKey = dest.city || dest.name;

    // Use city/name for grouping anchors
    if (!currentStop || currentStop.title !== groupingKey) {
      if (currentStop) {
        stops.push(currentStop);
      }
      currentStop = {
        title: groupingKey,
        type: dest.type || 'CITY',
        locations: dest.locations || [{
           name: dest.city || dest.name,
           lat: dest.lat,
           lng: dest.lng
        }],
        order: stops.length,
        days: [],
      };
    }

    // Add Day to Stop
    currentStop.days.push({
      dayIndex: dest.day,
      title: dest.name,
      suggestedHosts: dest.suggestedHosts || [],
      // date: computed? we don't track absolute dates in GlobeDestination yet, usually relative
      items: dest.activities.map((item, idx) => ({
        type: mapItemType(item.type),
        title: item.title,
        description: item.description,
        startTime: null, // item.timeSlot? we need mapping
        experienceId: item.experienceId,
        locationName: item.place?.name || item.location || dest.city || dest.name,
        lat: item.place?.location?.lat,
        lng: item.place?.location?.lng,
        orderIndex: idx,
        createdByAI: true // Assumed
      }))
    });
  }

  if (currentStop) {
    stops.push(currentStop);
  }

  return { stops };
}
