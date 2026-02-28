import type { TripPlanDaySnapshot, TripPlanStopSnapshot } from '@/lib/trips/repository';

function normalizeTextForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const normalized = normalizeTextForMatch(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(value.trim());
  }
  return deduped;
}

function cleanRemovalTarget(value: string): string | null {
  const withoutWrappers = value
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\b(in|from)\s+(my|the)\s+(itinerary|trip|plan)\b/gi, '')
    .replace(/\b(in|from)\s+(itinerary|trip|plan)\b/gi, '')
    .replace(/\bplease\b/gi, '')
    .trim();
  if (!withoutWrappers) return null;
  const strippedArticle = withoutWrappers.replace(/^(the|a|an)\s+/i, '').trim();
  const normalized = normalizeTextForMatch(strippedArticle);
  if (!normalized) return null;
  const genericTargets = new Set([
    'it',
    'them',
    'that',
    'this',
    'there',
    'here',
    'something',
    'anything',
    'everything',
    'thing',
    'things',
    'all',
    'one',
    'ones',
  ]);
  if (
    genericTargets.has(normalized) ||
    normalized === 'itinerary' ||
    normalized === 'trip' ||
    normalized === 'plan'
  ) {
    return null;
  }
  if (normalized.length < 2) return null;
  return strippedArticle;
}

function splitRemovalCandidates(value: string): string[] {
  return value
    .split(/\s*(?:,|;| and |&)\s*/i)
    .map((part) => cleanRemovalTarget(part))
    .filter((part): part is string => typeof part === 'string' && part.length > 0);
}

const ITINERARY_REMOVAL_PATTERNS = [
  /\b(?:remove|delete|drop|skip|exclude)\s+(.+?)(?:\s+from\b|\s+in\b|[.!?]|$)/gi,
  /\b(?:don['’]t like|do not like|hate|not a fan of)\s+(.+?)(?:\s+from\b|\s+in\b|[.!?]|$)/gi,
  /\bwithout\s+(.+?)(?:[.!?]|$)/gi,
];

export function detectItineraryUpdateIntent(message: string): boolean {
  const normalized = message.toLowerCase();
  const hasEditVerb =
    /\b(remove|delete|drop|skip|exclude|without|don['’]t like|do not like|hate|not a fan of)\b/i.test(
      normalized
    );
  const hasItineraryContext = /\b(itinerary|plan|trip|day)\b/i.test(normalized);
  return hasEditVerb && hasItineraryContext;
}

export function detectItineraryReadIntent(message: string): boolean {
  const normalized = message.toLowerCase();
  const hasItineraryContext = /\b(itinerary|plan|trip)\b/i.test(normalized);
  const hasReadCue =
    /\b(show|list|what|current|existing|planned|review|summary|summarize|see)\b/i.test(normalized);
  const hasDirectQuestion =
    /\bwhat(?:'s| is)\s+(?:in|on)\s+(?:my|the)\s+(itinerary|plan|trip)\b/i.test(normalized);
  return hasItineraryContext && (hasReadCue || hasDirectQuestion);
}

export function extractItineraryRemovalTargets(
  message: string,
  explicitTargets: string[] = []
): string[] {
  const collected: string[] = [];

  explicitTargets.forEach((target) => {
    collected.push(...splitRemovalCandidates(target));
  });

  for (const pattern of ITINERARY_REMOVAL_PATTERNS) {
    for (const match of message.matchAll(pattern)) {
      if (!match[1]) continue;
      collected.push(...splitRemovalCandidates(match[1]));
    }
  }

  return dedupeStrings(collected);
}

export type ItineraryRemovalStats = {
  removedStops: string[];
  removedDays: string[];
  removedItems: string[];
};

function hasTargetMatch(value: string | null | undefined, normalizedTargets: string[]): boolean {
  if (!value) return false;
  const normalized = normalizeTextForMatch(value);
  if (!normalized) return false;
  return normalizedTargets.some(
    (target) => normalized.includes(target) || target.includes(normalized)
  );
}

export function removeItineraryTargetsFromStops(
  stops: TripPlanStopSnapshot[],
  targets: string[]
): { stops: TripPlanStopSnapshot[]; stats: ItineraryRemovalStats } {
  const normalizedTargets = dedupeStrings(targets).map((target) => normalizeTextForMatch(target));
  if (normalizedTargets.length === 0) {
    return {
      stops,
      stats: {
        removedStops: [],
        removedDays: [],
        removedItems: [],
      },
    };
  }

  const stats: ItineraryRemovalStats = {
    removedStops: [],
    removedDays: [],
    removedItems: [],
  };

  const nextStops: TripPlanStopSnapshot[] = [];

  for (const stop of stops) {
    const stopMatches =
      hasTargetMatch(stop.title, normalizedTargets) ||
      stop.locations.some((location) => hasTargetMatch(location.name, normalizedTargets));
    if (stopMatches) {
      stats.removedStops.push(stop.title);
      continue;
    }

    const nextDays: TripPlanDaySnapshot[] = [];
    for (const day of stop.days) {
      if (hasTargetMatch(day.title, normalizedTargets)) {
        stats.removedDays.push(day.title ?? `Day ${day.dayIndex}`);
        continue;
      }

      const nextItems = day.items.filter((item) => {
        const matches =
          hasTargetMatch(item.title, normalizedTargets) ||
          hasTargetMatch(item.locationName, normalizedTargets);
        if (matches) {
          stats.removedItems.push(item.title);
        }
        return !matches;
      });

      nextDays.push({
        ...day,
        items: nextItems,
      });
    }

    if (nextDays.length === 0 && stop.days.length > 0) {
      stats.removedStops.push(stop.title);
      continue;
    }

    nextStops.push({
      ...stop,
      days: nextDays,
    });
  }

  return {
    stops: nextStops,
    stats: {
      removedStops: dedupeStrings(stats.removedStops),
      removedDays: dedupeStrings(stats.removedDays),
      removedItems: dedupeStrings(stats.removedItems),
    },
  };
}

export function getRemovalCount(stats: ItineraryRemovalStats): number {
  return stats.removedStops.length + stats.removedDays.length + stats.removedItems.length;
}

export function formatRemovalSummary(stats: ItineraryRemovalStats): string {
  const segments: string[] = [];
  if (stats.removedStops.length > 0) {
    segments.push(`${stats.removedStops.length} stop${stats.removedStops.length === 1 ? '' : 's'}`);
  }
  if (stats.removedDays.length > 0) {
    segments.push(`${stats.removedDays.length} day${stats.removedDays.length === 1 ? '' : 's'}`);
  }
  if (stats.removedItems.length > 0) {
    segments.push(`${stats.removedItems.length} item${stats.removedItems.length === 1 ? '' : 's'}`);
  }
  if (segments.length === 0) return 'No matching itinerary entries were removed.';
  return `Removed ${segments.join(', ')}.`;
}
