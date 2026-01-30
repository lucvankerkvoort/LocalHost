import { GlobeDestination, getColorForDay } from '@/types/globe';
import { ItineraryItem } from '@/types/itinerary';

// Define partial types matching the Prisma response we expect
interface ApiItineraryItem {
  id: string;
  type: string;
  title: string;
  description: string | null;
  experienceId: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  orderIndex: number;
  experience?: {
      hostId: string;
  } | null;
}

interface ApiItineraryDay {
  id: string;
  dayIndex: number; 
  title: string | null;
  items: ApiItineraryItem[]; // Update reference
}

export interface ApiTripStop {
  id: string;
  city: string;
  lat: number;
  lng: number;
  days: ApiItineraryDay[];
}

export interface ApiTrip {
  id: string;
  userId: string;
  title: string;
  stops: ApiTripStop[];
}

export function convertTripToGlobeDestinations(trip: ApiTrip): GlobeDestination[] {
  const destinations: GlobeDestination[] = [];

  for (const stop of trip.stops) {
    for (const day of stop.days) {
        const activities: ItineraryItem[] = day.items
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map(item => ({
                id: item.id,
                type: item.type as any, 
                category: item.type.toLowerCase(), 
                title: item.title,
                hostId: item.experience?.hostId, 
                experienceId: item.experienceId,
                position: item.orderIndex,
                timeSlot: 'Flexible', 
                description: item.description || '',
                price: undefined,
                place: {
                    id: item.locationName ? `loc-${item.id}` : 'unknown',
                    name: item.locationName || stop.city,
                    location: {
                        lat: item.lat ?? stop.lat,
                        lng: item.lng ?? stop.lng,
                    }
                }
            } as ItineraryItem));

        destinations.push({
            id: day.id, 
            name: day.title || stop.city,
            lat: stop.lat,
            lng: stop.lng,
            day: day.dayIndex, 
            activities,
            color: getColorForDay(day.dayIndex),
            city: stop.city
        });
    }
  }

  return destinations.sort((a, b) => a.day - b.day);
}

export function convertGlobeDestinationsToApiPayload(destinations: GlobeDestination[]): any {
  const mapItemType = (type: ItineraryItem['type'] | undefined) => {
    if (!type) return 'SIGHT';
    return type;
  };

  // 1. Group by City to reconstruct Stops
  const stops: any[] = [];
  let currentStop: any = null;

  // Ensure sorted by day
  const sortedDestinations = [...destinations].sort((a, b) => a.day - b.day);

  for (const dest of sortedDestinations) {
    // Check if we can merge into current stop (same city)
    // Note: strict name check might be fragile if multiple stops in same city are desired, 
    // but for now it recreates the structure well enough.
    if (!currentStop || currentStop.city !== dest.city) {
      if (currentStop) {
        stops.push(currentStop);
      }
      currentStop = {
        city: dest.city || dest.name, // Fallback
        country: '', // simplified, we might lose country if not stored in dest
        lat: dest.lat,
        lng: dest.lng,
        order: stops.length,
        days: []
      };
    }

    // Add Day to Stop
    currentStop.days.push({
      dayIndex: dest.day,
      title: dest.name,
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
