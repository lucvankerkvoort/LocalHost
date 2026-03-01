import { GlobeDestination, getColorForDay } from '@/types/globe';
import { ItineraryItem } from '@/types/itinerary';

const DEBUG_TRIP_COORDINATES =
  process.env.NEXT_PUBLIC_DEBUG_TRIP_COORDINATES === '1' ||
  process.env.DEBUG_TRIP_COORDINATES === '1';

function logTripConverterDebug(event: string, payload: Record<string, unknown>) {
  if (!DEBUG_TRIP_COORDINATES) return;
  console.warn(`[trip-converter] ${event}`, payload);
}

function toTitleCase(value: string): string {
  if (!value) return '';
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

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
  placeId?: string | null;
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

function normalizePlaceIdForPersistence(placeId: string | undefined): string | undefined {
  if (!placeId || placeId.trim().length === 0) return undefined;
  const normalized = placeId.trim();
  if (
    normalized === 'unknown' ||
    normalized.startsWith('fallback-') ||
    normalized.startsWith('place-') ||
    normalized.startsWith('loc-')
  ) {
    return undefined;
  }
  return normalized;
}

export function convertTripToGlobeDestinations(trip: ApiTrip): GlobeDestination[] {
  const destinations: GlobeDestination[] = [];
  let fallbackItemCoordinateCount = 0;
  const fallbackSamples: Array<{
    stopTitle: string;
    dayIndex: number;
    itemId: string;
    itemTitle: string;
    anchorLat: number;
    anchorLng: number;
    itemLat: number | null;
    itemLng: number | null;
  }> = [];

  for (const stop of trip.stops) {
    // Determine primary location (first one)
    const primaryLoc = stop.locations?.[0] || { lat: 0, lng: 0, name: 'Unknown' };

    for (const day of stop.days) {
        const activities: ItineraryItem[] = day.items
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map(item => {
                if (typeof item.lat !== 'number' || typeof item.lng !== 'number') {
                  fallbackItemCoordinateCount += 1;
                  if (fallbackSamples.length < 5) {
                    fallbackSamples.push({
                      stopTitle: stop.title,
                      dayIndex: day.dayIndex,
                      itemId: item.id,
                      itemTitle: item.title,
                      anchorLat: primaryLoc.lat,
                      anchorLng: primaryLoc.lng,
                      itemLat: item.lat,
                      itemLng: item.lng,
                    });
                  }
                }

                return {
                id: item.id,
                type: normalizeItineraryType(item.type), 
                category: item.type.toLowerCase(), 
                title: toTitleCase(item.title),
                hostId: item.experience?.hostId || item.hostId || undefined, 
                experienceId: item.experienceId,
                status: deriveItineraryItemStatus(item),
                candidateId: deriveCandidateId(item),
                position: item.orderIndex,
                timeSlot: 'Flexible', 
                description: item.description || '',
                price: undefined,
                place: {
                    id: item.placeId || (item.locationName ? `loc-${item.id}` : 'unknown'),
                    name: toTitleCase(item.locationName || primaryLoc.name),
                    location: {
                        lat: item.lat ?? primaryLoc.lat,
                        lng: item.lng ?? primaryLoc.lng,
                    }
                }
            } as ItineraryItem;
          });

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

  if (fallbackItemCoordinateCount > 0) {
    logTripConverterDebug('item-coordinate-fallbacks', {
      tripId: trip.id,
      fallbackItemCoordinateCount,
      stopCount: trip.stops.length,
      samples: fallbackSamples,
    });
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
  placeId?: string;
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
      items: dest.activities.map((item, idx) => {
        const placeId = normalizePlaceIdForPersistence(item.place?.id);
        return {
          type: mapItemType(item.type),
          title: item.title,
          description: item.description,
          startTime: null, // item.timeSlot? we need mapping
          experienceId: item.experienceId,
          locationName: item.place?.name || item.location || dest.city || dest.name,
          ...(placeId ? { placeId } : {}),
          lat: item.place?.location?.lat,
          lng: item.place?.location?.lng,
          orderIndex: idx,
          createdByAI: true // Assumed
        };
      })
    });
  }

  if (currentStop) {
    stops.push(currentStop);
  }

  return { stops };
}
