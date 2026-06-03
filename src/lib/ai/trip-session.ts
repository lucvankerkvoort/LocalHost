/**
 * Trip Session Management
 *
 * Stores and manages trip context across conversation messages.
 * Enables the orchestrator to maintain context for modifications,
 * scoped host searches, and booking flows.
 */

import { ItineraryPlan } from './types';
import type { PartialTripRequirements } from '@/types/trip-requirements';

// ============================================================================
// Types
// ============================================================================

export type UserIntent = 
  | 'CREATE_PLAN'    // "Plan a trip to X"
  | 'MODIFY_PLAN'    // "Change to different islands", "Add a museum"
  | 'FIND_HOSTS'     // "Show me cooking classes", "Find local guides"
  | 'ADD_HOST'       // "Add this to day 2"
  | 'BOOK'           // "Book this experience"
  | 'GENERAL';       // General questions, chitchat

export interface BookingItem {
  id: string;
  experienceId: string;
  title: string;
  hostName: string;
  price: number;
  currency: string;
  date?: string;
  guests: number;
  status: 'tentative' | 'confirmed';
  chatUnlocked: boolean;
}

export interface TripSession {
  id: string;
  country: string;
  city: string;
  plan: ItineraryPlan | null;
  /**
   * Accumulated trip requirements gathered via conversational intake.
   * Starts empty and is built up across messages until all required fields
   * are present, at which point planTrip() is called.
   */
  requirements: PartialTripRequirements;
  preferences: string[];
  suggestedHosts: HostMarker[];
  tentativeBookings: BookingItem[];
  confirmedBookings: BookingItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface HostMarker {
  id: string;
  hostId: string;
  name: string;
  photo: string;
  headline?: string;
  lat: number;
  lng: number;
  category: string;
  rating?: number;
  experienceCount: number;
}

// ============================================================================
// Session Factory
// ============================================================================

export function createSession(country: string, city: string): TripSession {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    country,
    city,
    plan: null,
    requirements: {},
    preferences: [],
    suggestedHosts: [],
    tentativeBookings: [],
    confirmedBookings: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function updateSessionRequirements(
  session: TripSession,
  requirements: PartialTripRequirements,
): TripSession {
  return {
    ...session,
    // Carry city/country forward so existing lookups still work
    city: requirements.destination?.city ?? session.city,
    country: requirements.destination?.country ?? session.country,
    requirements,
    updatedAt: new Date(),
  };
}

export function updateSessionPlan(session: TripSession, plan: ItineraryPlan): TripSession {
  return {
    ...session,
    plan,
    updatedAt: new Date(),
  };
}

export function updateSessionHosts(session: TripSession, hosts: HostMarker[]): TripSession {
  return {
    ...session,
    suggestedHosts: hosts,
    updatedAt: new Date(),
  };
}

export function addTentativeBooking(session: TripSession, item: BookingItem): TripSession {
  return {
    ...session,
    tentativeBookings: [...session.tentativeBookings, { ...item, status: 'tentative', chatUnlocked: false }],
    // Remove from suggestions if present
    suggestedHosts: session.suggestedHosts.filter(h => h.hostId !== item.experienceId && h.id !== item.experienceId),
    updatedAt: new Date(),
  };
}

export function confirmBooking(session: TripSession, bookingId: string): TripSession {
  const booking = session.tentativeBookings.find(b => b.id === bookingId);
  if (!booking) return session;

  return {
    ...session,
    tentativeBookings: session.tentativeBookings.filter(b => b.id !== bookingId),
    confirmedBookings: [...session.confirmedBookings, { ...booking, status: 'confirmed', chatUnlocked: true }],
    updatedAt: new Date(),
  };
}

// ============================================================================
// Intent Keywords (used as hints for LLM classification)
// ============================================================================

export const INTENT_HINTS: Record<UserIntent, string[]> = {
  CREATE_PLAN: ['plan', 'trip to', 'itinerary', 'travel to', 'visiting', 'days in'],
  MODIFY_PLAN: ['change', 'modify', 'adjust', 'instead', 'rather', 'different', 'add', 'remove', 'swap'],
  FIND_HOSTS: ['find', 'show me', 'search', 'looking for', 'local', 'hosts', 'experiences', 'classes'],
  ADD_HOST: ['add this', 'book this', 'include this', 'add to day', 'interested in'],
  BOOK: ['book', 'reserve', 'confirm', 'schedule', 'pay'],
  GENERAL: [],
};
