/**
 * ItineraryPlan - Core data models for the map-first itinerary builder
 * 
 * The ItineraryPlan is the source of truth shared across:
 * - AI chatbot (planner)
 * - Experience discovery (cards/grid)
 * - Map visualization (Resium + CesiumJS)
 * - Booking flow
 */

import type { ExperienceCategory } from './index';

// ============================================================================
// Experience Lifecycle States
// ============================================================================

/**
 * Every experience attached to an itinerary has a clear lifecycle status:
 * - DRAFT: Suggested by AI or user, not yet checked for availability
 * - PENDING: User selected a timeslot, availability being checked or held
 * - BOOKED: Confirmed and paid
 * - FAILED: Unavailable, requires alternative
 */
export type ExperienceStatus = 'DRAFT' | 'PENDING' | 'BOOKED' | 'FAILED';

export const EXPERIENCE_STATUS_CONFIG: Record<ExperienceStatus, {
  label: string;
  color: string;
  mapOpacity: number;
  icon: string;
}> = {
  DRAFT: {
    label: 'Suggested',
    color: '#9ca3af',    // Gray
    mapOpacity: 0.4,
    icon: '👻',
  },
  PENDING: {
    label: 'Checking...',
    color: '#f59e0b',    // Amber
    mapOpacity: 0.8,
    icon: '⏳',
  },
  BOOKED: {
    label: 'Confirmed',
    color: '#10b981',    // Green
    mapOpacity: 1.0,
    icon: '✓',
  },
  FAILED: {
    label: 'Unavailable',
    color: '#ef4444',    // Red
    mapOpacity: 0.6,
    icon: '⚠️',
  },
};

// ============================================================================
// Location Types
// ============================================================================

/**
 * Location can be exact, fuzzy (area), or hidden (revealed after booking)
 */
export type LocationType = 'exact' | 'area' | 'hidden';

export interface GeoLocation {
  type: LocationType;
  city: string;
  country: string;
  neighborhood?: string;
  lat?: number;
  lng?: number;
  radiusMeters?: number;  // For fuzzy 'area' display
}

export interface DayLocation {
  city: string;
  country: string;
  lat: number;
  lng: number;
  region?: string;        // "Shinjuku", "El Born", etc.
}

// ============================================================================
// Timeslot
// ============================================================================

export interface Timeslot {
  date: string;           // ISO date "2026-03-15"
  startTime: string;      // "10:00"
  endTime: string;        // "13:00"
}

// ============================================================================
// ExperienceItem (Localhost Anchor)
// ============================================================================

/**
 * An experience attached to an itinerary day.
 * This is the "anchor" that shapes the day.
 */
export interface ExperienceItem {
  id: string;
  
  // References
  experienceId: string;   // Reference to full Experience
  hostId: string;         // Reference to Host
  
  // Lifecycle
  status: ExperienceStatus;
  failureReason?: string; // If status is FAILED
  
  // Scheduling
  timeslot?: Timeslot;
  
  // Location (fuzzy until booked)
  location: GeoLocation;
  
  // Cached display data (denormalized for performance)
  title: string;
  description: string;
  hostName: string;
  hostPhoto: string;
  duration: number;       // minutes
  price: number;          // cents
  currency: string;
  category: ExperienceCategory;
  rating: number;
  reviewCount: number;
  photo: string;
}

// ============================================================================
// FillerItem (Non-Localhost items)
// ============================================================================

export type FillerType = 'poi' | 'meal' | 'transport' | 'free-time' | 'note';

export interface FillerItem {
  id: string;
  type: FillerType;
  title: string;
  description?: string;
  time?: string;          // "14:00"
  duration?: number;      // minutes
  location?: {
    lat: number;
    lng: number;
    name: string;
  };
}

export const FILLER_TYPE_CONFIG: Record<FillerType, {
  label: string;
  icon: string;
  color: string;
}> = {
  poi: { label: 'Point of Interest', icon: '📍', color: '#6366f1' },
  meal: { label: 'Meal', icon: '🍽️', color: '#f97316' },
  transport: { label: 'Transport', icon: '🚃', color: '#0ea5e9' },
  'free-time': { label: 'Free Time', icon: '☀️', color: '#84cc16' },
  note: { label: 'Note', icon: '📝', color: '#8b5cf6' },
};

// ============================================================================
// ItineraryDay
// ============================================================================

/**
 * A single day in the itinerary.
 * Each day has a location, one primary anchor, and optional fillers.
 */
export interface ItineraryDay {
  id: string;
  dayNumber: number;
  date: string;           // ISO date
  location: DayLocation;
  
  // Primary Localhost experience (the "anchor")
  anchor: ExperienceItem | null;
  
  // Optional flexible filler items
  fillers: FillerItem[];
}

// ============================================================================
// ItineraryPlan (Source of Truth)
// ============================================================================

/**
 * The complete itinerary plan.
 * This is the canonical data model shared across all components.
 */
export interface ItineraryPlan {
  id: string;
  title: string;
  startDate: string;      // ISO date
  endDate: string;        // ISO date
  days: ItineraryDay[];
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  
  // Optional: User preferences for AI optimization
  preferences?: {
    focus?: string[];     // ["food", "culture", "nature"]
    pace?: 'relaxed' | 'moderate' | 'packed';
    budget?: 'budget' | 'mid' | 'luxury';
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function createEmptyDay(dayNumber: number, date: string, location: DayLocation): ItineraryDay {
  return {
    id: generateId(),
    dayNumber,
    date,
    location,
    anchor: null,
    fillers: [],
  };
}

export function createItineraryPlan(
  title: string,
  startDate: string,
  endDate: string,
  locations: DayLocation[]
): ItineraryPlan {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dayCount = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  const days: ItineraryDay[] = [];
  for (let i = 0; i < dayCount; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const location = locations[Math.min(i, locations.length - 1)];
    days.push(createEmptyDay(i + 1, date.toISOString().split('T')[0], location));
  }
  
  return {
    id: generateId(),
    title,
    startDate,
    endDate,
    days,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get the overall status of an itinerary based on its anchors
 */
export function getItineraryStatus(plan: ItineraryPlan): {
  total: number;
  booked: number;
  pending: number;
  draft: number;
  failed: number;
} {
  const anchors = plan.days.map(d => d.anchor).filter(Boolean) as ExperienceItem[];
  return {
    total: anchors.length,
    booked: anchors.filter(a => a.status === 'BOOKED').length,
    pending: anchors.filter(a => a.status === 'PENDING').length,
    draft: anchors.filter(a => a.status === 'DRAFT').length,
    failed: anchors.filter(a => a.status === 'FAILED').length,
  };
}

// ============================================================================
// Sample Data for Testing
// ============================================================================

export const SAMPLE_LOCATIONS: Record<string, DayLocation> = {
  tokyo: { city: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503, region: 'Shinjuku' },
  kyoto: { city: 'Kyoto', country: 'Japan', lat: 35.0116, lng: 135.7681, region: 'Gion' },
  osaka: { city: 'Osaka', country: 'Japan', lat: 34.6937, lng: 135.5023, region: 'Dotonbori' },
  rome: { city: 'Rome', country: 'Italy', lat: 41.9028, lng: 12.4964, region: 'Trastevere' },
  barcelona: { city: 'Barcelona', country: 'Spain', lat: 41.3851, lng: 2.1734, region: 'El Born' },
};
