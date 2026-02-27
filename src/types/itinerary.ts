// Itinerary types for the visual builder

export type ItineraryItemType = 
  | 'SIGHT' 
  | 'EXPERIENCE' 
  | 'MEAL' 
  | 'FREE_TIME' 
  | 'TRANSPORT' 
  | 'NOTE' 
  | 'LODGING';

export const ITEM_TYPE_CONFIG: Record<ItineraryItemType, { label: string; icon: string; color: string }> = {
  SIGHT: { label: 'Sight', icon: '👀', color: 'var(--blue-green)' },
  EXPERIENCE: { label: 'Experience', icon: '✨', color: 'var(--amber-flame)' },
  MEAL: { label: 'Food & Drink', icon: '🍽️', color: 'var(--princeton-orange)' },
  FREE_TIME: { label: 'Free Time', icon: '🧘', color: 'var(--sky-blue)' },
  TRANSPORT: { label: 'Transport', icon: '🚗', color: 'var(--muted)' },
  NOTE: { label: 'Note', icon: '📝', color: 'var(--muted-foreground)' },
  LODGING: { label: 'Accommodation', icon: '🏨', color: 'var(--deep-space-blue)' },
};

export interface ItineraryItem {
  id: string;
  type: ItineraryItemType;
  title: string;
  description?: string;
  location?: string;
  startTime?: string; // HH:MM format
  endTime?: string;
  hostId?: string; // Future: link to Localhost experience
  experienceId?: string; // Specific experience ID
  status?: 'DRAFT' | 'PENDING' | 'BOOKED' | 'FAILED';
  candidateId?: string; // Link to ExperienceCandidate for booking
  isLocal?: boolean; // Local-only item (not persisted)
  position: number;
  place?: {
    id: string;
    name: string;
    location: {
      lat: number;
      lng: number;
    };
    category?: string;
    address?: string;
    city?: string;
    description?: string;
    confidence?: number;
    geoValidation?: 'EXACT' | 'APPROXIMATE' | 'CITY_FALLBACK' | 'FAILED';
    imageUrl?: string;
    imageUrls?: string[];
  };
  duration?: number; // duration in minutes
  category?: string; // specific category if different from type
}

export interface ItineraryDay {
  id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  dayNumber: number;
  items: ItineraryItem[];
}

export interface Itinerary {
  id: string;
  title: string;
  destination: string;
  startDate: string; // ISO date string
  endDate: string;
  days: ItineraryDay[];
  createdAt: string;
  updatedAt: string;
}

// Helper to generate unique IDs
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Helper to create days array from date range
export function createDaysFromRange(startDate: string, endDate: string): ItineraryDay[] {
  const days: ItineraryDay[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let dayNumber = 1;
  const current = new Date(start);
  
  while (current <= end) {
    days.push({
      id: generateId(),
      date: current.toISOString().split('T')[0],
      dayNumber,
      items: [],
    });
    current.setDate(current.getDate() + 1);
    dayNumber++;
  }
  
  return days;
}

// Helper to create a new itinerary
export function createItinerary(
  title: string, 
  destination: string, 
  startDate: string, 
  endDate: string
): Itinerary {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    title,
    destination,
    startDate,
    endDate,
    days: createDaysFromRange(startDate, endDate),
    createdAt: now,
    updatedAt: now,
  };
}

// Helper to create a new item
export function createItem(
  type: ItineraryItemType,
  title: string,
  position: number,
  options?: Partial<Omit<ItineraryItem, 'id' | 'type' | 'title' | 'position'>>
): ItineraryItem {
  return {
    id: generateId(),
    type,
    title,
    position,
    ...options,
  };
}
