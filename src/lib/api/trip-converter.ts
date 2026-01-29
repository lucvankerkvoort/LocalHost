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

// ... (ApiTripStop and ApiTrip remain same)

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
                hostId: item.experience?.hostId, // Map hostId from relation
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
            id: day.id, // Use Day ID as the unique key for the "Destination/Day" view
            name: day.title || stop.city,
            lat: stop.lat,
            lng: stop.lng,
            day: day.dayIndex, // Assuming this aligns with Globe's expectation (1-based?)
            activities,
            color: getColorForDay(day.dayIndex),
            city: stop.city
        });
    }
  }

  return destinations.sort((a, b) => a.day - b.day);
}
