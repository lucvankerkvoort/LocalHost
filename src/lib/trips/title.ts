import type { ItineraryPlan } from '@/lib/ai/types';

type TripStyle = 'road' | 'rail' | 'boat' | 'air' | 'general';

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function extractDurationDays(request: string | undefined): number | null {
  if (!request) return null;
  const dayMatch = request.match(/\b(\d{1,2})\s*day(?:s)?\b/i);
  if (dayMatch) return Number(dayMatch[1]);

  const weekMatch = request.match(/\b(\d{1,2})\s*week(?:s)?\b/i);
  if (weekMatch) return Number(weekMatch[1]) * 7;
  return null;
}

function inferTripStyle(request: string | undefined): TripStyle {
  const normalized = (request ?? '').toLowerCase();
  if (/\broad\s*trip\b|\bdrive\b|\bcar\b/.test(normalized)) return 'road';
  if (/\btrain\b|\brail\b/.test(normalized)) return 'rail';
  if (/\bboat\b|\bferry\b|\bcruise\b|\bship\b/.test(normalized)) return 'boat';
  if (/\bflight\b|\bfly\b|\bair\b|\bplane\b/.test(normalized)) return 'air';
  return 'general';
}

function extractAdjectiveScope(request: string | undefined): string | null {
  if (!request) return null;
  const adjectiveMatch = request.match(
    /\b([a-z][a-z'-]+)\s+(?:road\s*trip|trip|itinerary|vacation|holiday)\b/i
  );
  if (!adjectiveMatch) return null;

  const token = adjectiveMatch[1].trim();
  if (token.length < 4) return null;
  if (!/(an|ian)$/i.test(token)) return null;
  return toTitleCase(token);
}

function getUnique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  values.forEach((value) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  });
  return out;
}

function inferScopeFromPlan(plan: Pick<ItineraryPlan, 'days'>): string | null {
  const cities = getUnique(plan.days.map((day) => day.city ?? null));
  const countries = getUnique(plan.days.map((day) => day.country ?? null));

  if (countries.length === 1 && cities.length > 1) {
    return toTitleCase(countries[0]);
  }

  if (cities.length === 1) {
    return toTitleCase(cities[0]);
  }

  if (countries.length === 1) {
    return toTitleCase(countries[0]);
  }

  if (cities.length > 1) {
    return 'Multi-City';
  }

  return null;
}

function getStyleLabel(style: TripStyle): string {
  switch (style) {
    case 'road':
      return 'Road Trip';
    case 'rail':
      return 'Rail Journey';
    case 'boat':
      return 'Coastal Journey';
    case 'air':
      return 'Journey';
    default:
      return 'Adventure';
  }
}

function normalizeExistingTitle(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^trip$/i.test(trimmed)) return null;
  if (/^my (first )?trip$/i.test(trimmed)) return null;
  if (/^new trip$/i.test(trimmed)) return null;
  return trimmed;
}

export function generateTripTitleFromPlan(
  plan: Pick<ItineraryPlan, 'title' | 'request' | 'days'>
): string {
  const durationDays = extractDurationDays(plan.request) ?? (plan.days.length > 0 ? plan.days.length : null);
  const scope = extractAdjectiveScope(plan.request) ?? inferScopeFromPlan(plan);
  const style = inferTripStyle(plan.request);
  const styleLabel = getStyleLabel(style);

  if (durationDays && scope) {
    return `${durationDays}-Day ${scope} ${styleLabel}`;
  }

  if (scope) {
    return `${scope} ${styleLabel}`;
  }

  if (durationDays) {
    return `${durationDays}-Day ${styleLabel}`;
  }

  return normalizeExistingTitle(plan.title) ?? 'My Trip';
}
