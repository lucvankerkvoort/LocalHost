import { GlobeDestination, getColorForDay } from '@/types/globe';
import { ItineraryItem } from '@/types/itinerary';

const DEBUG_TRIP_COORDINATES =
  process.env.NEXT_PUBLIC_DEBUG_TRIP_COORDINATES === '1' ||
  process.env.DEBUG_TRIP_COORDINATES === '1';

function logTripConverterDebug(event: string, payload: Record<string, unknown>) {
  if (!DEBUG_TRIP_COORDINATES) return;
  console.warn(`[trip-converter] ${event}`, payload);
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
      photos?: string[];
      host?: { name?: string | null; image?: string | null } | null;
  } | null;
  images?: Array<{
      id: string;
      position: number;
      assetId?: string | null;
      url: string;
      attributionJson?: unknown;
      provider?: string | null;
  }>;
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

function parseImageAttribution(
  raw: unknown
): { displayName?: string; uri?: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  const attribution: { displayName?: string; uri?: string } = {};
  if (typeof source.displayName === 'string') attribution.displayName = source.displayName;
  if (typeof source.uri === 'string') attribution.uri = source.uri;
  return attribution.displayName || attribution.uri ? attribution : undefined;
}

function normalizePersistedPlaceId(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('loc-')) return undefined;
  if (trimmed.startsWith('fallback-')) return undefined;
  if (trimmed === 'unknown') return undefined;
  return trimmed;
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
        .map((item) => {
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

          const persistedImages = (item.images ?? [])
            .sort((a, b) => a.position - b.position)
            .map((image) => {
              const attribution = parseImageAttribution(image.attributionJson);
              return {
                url: image.url,
                ...(attribution ? { attribution } : {}),
              };
            });

          return {
            id: item.id,
            type: normalizeItineraryType(item.type),
            category: item.type.toLowerCase(),
            title: item.title,
            hostId: item.experience?.hostId || item.hostId || undefined,
            hostName: item.experience?.host?.name ?? undefined,
            hostPhoto: item.experience?.host?.image ?? item.experience?.photos?.[0] ?? undefined,
            experienceId: item.experienceId ?? undefined,
            status: deriveItineraryItemStatus(item),
            candidateId: deriveCandidateId(item),
            position: item.orderIndex,
            timeSlot: 'Flexible',
            description: item.description || '',
            price: undefined,
            place: {
              id:
                normalizePersistedPlaceId(item.placeId) ??
                (item.locationName ? `loc-${item.id}` : 'unknown'),
              name: item.locationName || primaryLoc.name,
              location: {
                lat: item.lat ?? primaryLoc.lat,
                lng: item.lng ?? primaryLoc.lng,
              },
              city: primaryLoc.name,
              description: item.description || undefined,
              images: persistedImages.length > 0 ? persistedImages : undefined,
              imageUrl: persistedImages[0]?.url || item.experience?.photo || undefined,
            },
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
  let globalDayIndex = 0;

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
    globalDayIndex += 1;
    currentStop.days.push({
      dayIndex: globalDayIndex,
      title: dest.name,
      suggestedHosts: dest.suggestedHosts || [],
      items: dest.activities.map((item, idx) => ({
        type: mapItemType(item.type),
        title: item.title,
        description: item.description || item.place?.description || null,
        startTime: null,
        // Only persist real DB experience IDs (cuid/uuid, length > 10).
        // Static curated IDs like '1', '1b' fail FK constraints and must be dropped.
        experienceId: (item.experienceId && item.experienceId.length > 10) ? item.experienceId : null,
        hostId: item.hostId ?? null,
        locationName: item.place?.name || item.location || dest.city || dest.name,
        placeId: normalizePersistedPlaceId(item.place?.id),
        lat: item.place?.location?.lat,
        lng: item.place?.location?.lng,
        orderIndex: idx,
        createdByAI: true
      }))
    });
  }

  if (currentStop) {
    stops.push(currentStop);
  }

  return { stops };
}
