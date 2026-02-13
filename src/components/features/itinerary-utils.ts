import type { ItineraryItem } from '@/types/itinerary';

export function isHostedExperienceItem(item: ItineraryItem): boolean {
  return item.type === 'EXPERIENCE' && Boolean(item.hostId) && Boolean(item.experienceId);
}

export function formatItineraryDayDate(dateString?: string): string | null {
  if (!dateString) return null;

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function resolveItineraryDayHeadline(
  dateString: string | undefined,
  title: string | undefined,
  dayNumber: number
): string {
  const formattedDate = formatItineraryDayDate(dateString);
  if (formattedDate) return formattedDate;

  const trimmedTitle = title?.trim();
  return trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : `Day ${dayNumber}`;
}

export function resolveItineraryDayCaption(
  dateString: string | undefined,
  title: string | undefined,
  city: string | undefined,
  dayNumber: number
): string {
  const formattedDate = formatItineraryDayDate(dateString);
  const trimmedTitle = title?.trim();
  const fallbackTitle = trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : `Day ${dayNumber}`;

  if (formattedDate) {
    return fallbackTitle;
  }

  const trimmedCity = city?.trim();
  return trimmedCity && trimmedCity.length > 0 ? trimmedCity : fallbackTitle;
}
