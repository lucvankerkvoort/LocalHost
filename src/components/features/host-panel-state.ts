import type { ItineraryItem } from '@/types/itinerary';

export type HostExperienceCtaState = 'ADD' | 'REMOVE' | 'BOOKED';

export function buildAddedExperienceIds(activities: ItineraryItem[] | null | undefined): Set<string> {
  if (!activities?.length) return new Set<string>();

  return new Set(
    activities
      .filter((item) => item.experienceId)
      .map((item) => item.experienceId!)
  );
}

export function buildBookedExperienceIds(activities: ItineraryItem[] | null | undefined): Set<string> {
  if (!activities?.length) return new Set<string>();

  return new Set(
    activities
      .filter((item) => item.experienceId && item.status === 'BOOKED')
      .map((item) => item.experienceId!)
  );
}

export function getHostExperienceCtaState(
  isAdded: boolean,
  isBooked: boolean
): HostExperienceCtaState {
  if (isBooked) return 'BOOKED';
  if (isAdded) return 'REMOVE';
  return 'ADD';
}
