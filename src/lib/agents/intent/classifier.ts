import type { TravelProfile } from '@/lib/travel-profile/types';
import type { TripIntent, SpatialPattern, ActivityFocus, MobilityMode } from './types';

function extractUserText(messages: Array<{ role?: string; content?: unknown }>): string {
  return messages
    .filter((m) => m.role === 'user')
    .map((m) => {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return (m.content as Array<{ type?: string; text?: string }>)
          .map((p) => (p.type === 'text' ? (p.text ?? '') : ''))
          .join(' ');
      }
      return '';
    })
    .join(' ')
    .toLowerCase();
}

function detectSpatialPattern(
  text: string,
  profile: TravelProfile | null | undefined
): SpatialPattern {
  if (
    /\b(stay(ing)? in|based in|base in|airbnb in .{1,30} and|from one place|single base|explore (the |around the |the )?(region|area|surrounding|nearby))\b/.test(
      text
    )
  )
    return 'BASE_EXPLORE';

  if (
    /\b(road trip|drive (from|through|across|along)|from .{1,30} to .{1,30}|along (the |highway|route ?\d)|pch)\b/.test(
      text
    )
  )
    return 'LINEAR_ROUTE';

  if (
    /\b(hop(ping)? between|multiple (cities|countries|destinations)|city hopping|visit .{1,20} (then|and then|followed by))\b/.test(
      text
    )
  )
    return 'MULTI_DESTINATION';

  if (/\b(base (in|at|camp)?|hub (in|at|city)?|day trips? (from|out of))\b/.test(text))
    return 'HUB_SPOKE';

  // Profile priors — only apply when no explicit signal in message
  if (profile?.travelStyle === 'ROAD_TRIP') return 'LINEAR_ROUTE';
  if (profile?.travelStyle === 'REGION_EXPLORER') return 'BASE_EXPLORE';
  if (profile?.travelStyle === 'MULTI_COUNTRY') return 'MULTI_DESTINATION';

  return 'UNKNOWN';
}

function detectActivityFocus(
  text: string,
  profile: TravelProfile | null | undefined
): ActivityFocus {
  if (
    /\b(hik(e|ing)|trail(s)?|trek(king)?|mountain|climb(ing)?|national park|wildlife|nature walk|outdoors?)\b/.test(
      text
    )
  )
    return 'NATURE';

  if (
    /\b(museum|history|historic|culture|cultural|art |heritage|architecture|monument|cathedral|gallery)\b/.test(
      text
    )
  )
    return 'CULTURE';

  if (
    /\b(food|eat(ing)?|restaurant|cuisine|gastro|market|wine|taste|culinary|street food|local food)\b/.test(
      text
    )
  )
    return 'FOOD';

  if (
    /\b(adventure|surfing|diving|scuba|bungee|extreme sport|kayak|rafting|adrenaline)\b/.test(text)
  )
    return 'ADVENTURE';

  // Profile interest priors
  const interests = profile?.interests?.join(' ').toLowerCase() ?? '';
  if (interests && /hik|trail|outdoor|nature/.test(interests)) return 'NATURE';
  if (interests && /food|cuisine|culinary|gastro/.test(interests)) return 'FOOD';
  if (interests && /museum|history|culture|art/.test(interests)) return 'CULTURE';
  if (interests && /adventure|surf|dive|sport/.test(interests)) return 'ADVENTURE';

  return 'UNKNOWN';
}

function detectMobilityMode(
  text: string,
  profile: TravelProfile | null | undefined
): MobilityMode {
  if (/\brv\b|motorhome|campervan|camper van/.test(text)) return 'RV';
  if (
    /\b(driv(e|ing|er)|rental car|own car|road trip|rent a car|by car)\b/.test(text)
  )
    return 'OWN_CAR';
  if (
    /\b(fly(ing)?|flight(s)?|airport|fly between|connecting flight|book a flight)\b/.test(text)
  )
    return 'FLIGHTS_ONLY';
  if (
    /\b(no car|car-?free|public transport|by train|by bus|on foot|walking only)\b/.test(text)
  )
    return 'NO_CAR';

  // Profile priors
  if (profile?.transportPreference === 'drive') return 'OWN_CAR';
  if (profile?.transportPreference === 'flight') return 'FLIGHTS_ONLY';
  if (profile?.transportPreference === 'mixed') return 'MIXED';
  if (profile?.travelStyle === 'ROAD_TRIP') return 'OWN_CAR';
  if (profile?.travelStyle === 'MULTI_COUNTRY') return 'FLIGHTS_ONLY';

  return 'UNKNOWN';
}

/**
 * Derive trip intent from conversation history and the user's saved travel profile.
 * Uses heuristic pattern matching — no LLM call needed.
 */
export function classifyIntent(
  messages: Array<{ role?: string; content?: unknown }>,
  profile: TravelProfile | null | undefined
): TripIntent {
  const text = extractUserText(messages);

  const spatialPattern = detectSpatialPattern(text, profile);
  const activityFocus = detectActivityFocus(text, profile);
  const mobilityMode = detectMobilityMode(text, profile);
  const pace = profile?.pace
    ? (profile.pace.toLowerCase() as 'relaxed' | 'balanced' | 'packed')
    : undefined;

  const unresolvedDimensions: TripIntent['unresolvedDimensions'] = [];
  if (spatialPattern === 'UNKNOWN') unresolvedDimensions.push('spatialPattern');
  if (mobilityMode === 'UNKNOWN') unresolvedDimensions.push('mobilityMode');
  if (activityFocus === 'UNKNOWN') unresolvedDimensions.push('activityFocus');
  if (!pace) unresolvedDimensions.push('pace');

  return { spatialPattern, activityFocus, mobilityMode, pace, unresolvedDimensions };
}
