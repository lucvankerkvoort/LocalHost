import { z } from 'zod';
import type { AgentContext } from './agent';
import { normalizeDestinations } from './planner-helpers';
import type { PlannerSnapshot as ControllerPlannerSnapshot } from './generation-controller';
import { getPlannerTripSeedForUser } from '@/lib/trips/repository';

const PLANNER_ONBOARDING_START_TOKEN = 'ACTION:START_PLANNER';

export type PlannerFlowState = {
  destinations: string[];
  destinationScope: 'city' | 'multi_city' | 'country' | 'region' | 'unknown';
  needsCities: boolean;
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  goalTheme?: string;
  partySize?: number;
  partyType?: string;
  budget?: 'budget' | 'mid' | 'premium';
  pace?: 'relaxed' | 'balanced' | 'packed';
  mustSee?: string[];
  mustSeeProvided: boolean;
  avoid?: string[];
  avoidProvided: boolean;
  lodgingArea?: string;
  transportPreference?: string;
  dailyStartPreference?: string;
  latestEndTime?: string;
  foodPreferences?: string[];
  foodPreferencesProvided: boolean;
  accessibilityNeeds?: string;
  hostExperiences?: boolean;
  hostExperiencesPerCity?: number;
  hasGenerated: boolean;
  hasFlown: boolean;
  lastQuestionKey?: string;
};

export const DEFAULT_PLANNER_STATE: PlannerFlowState = {
  destinations: [],
  destinationScope: 'unknown',
  needsCities: false,
  mustSeeProvided: false,
  avoidProvided: false,
  foodPreferencesProvided: false,
  hasGenerated: false,
  hasFlown: false,
};

export type PlannerGenerationSnapshot = ControllerPlannerSnapshot & {
  sessionId: string;
  tripId: string | null;
  userId: string | null;
  expectedVersion?: number;
  destinations: string[];
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  partySize?: number;
  partyType?: string;
  preferences: {
    goalTheme?: string;
    budget?: 'budget' | 'mid' | 'premium';
    pace?: 'relaxed' | 'balanced' | 'packed';
    mustSee?: string[];
    avoid?: string[];
    lodgingArea?: string;
    transportPreference?: string;
    dailyStartPreference?: string;
    latestEndTime?: string;
    foodPreferences?: string[];
    accessibilityNeeds?: string;
    hostExperiences?: boolean;
    hostExperiencesPerCity?: number;
  };
};

export function buildPlannerGenerationSnapshot(params: {
  request: string;
  sessionId: string;
  tripId: string | null;
  userId: string | null;
  state: PlannerFlowState;
  expectedVersion?: number;
}): PlannerGenerationSnapshot {
  return {
    request: params.request,
    createdAt: Date.now(),
    sessionId: params.sessionId,
    tripId: params.tripId,
    userId: params.userId,
    expectedVersion: params.expectedVersion,
    destinations: [...params.state.destinations],
    startDate: params.state.startDate,
    endDate: params.state.endDate,
    durationDays: params.state.durationDays,
    partySize: params.state.partySize,
    partyType: params.state.partyType,
    preferences: {
      goalTheme: params.state.goalTheme,
      budget: params.state.budget,
      pace: params.state.pace,
      mustSee: params.state.mustSee ? [...params.state.mustSee] : undefined,
      avoid: params.state.avoid ? [...params.state.avoid] : undefined,
      lodgingArea: params.state.lodgingArea,
      transportPreference: params.state.transportPreference,
      dailyStartPreference: params.state.dailyStartPreference,
      latestEndTime: params.state.latestEndTime,
      foodPreferences: params.state.foodPreferences ? [...params.state.foodPreferences] : undefined,
      accessibilityNeeds: params.state.accessibilityNeeds,
      hostExperiences: params.state.hostExperiences,
      hostExperiencesPerCity: params.state.hostExperiencesPerCity,
    },
  };
}

export function isPlannerOnboardingTriggerMessage(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed === PLANNER_ONBOARDING_START_TOKEN ||
    trimmed.startsWith(`${PLANNER_ONBOARDING_START_TOKEN}:`)
  );
}

export async function seedPlannerStateFromTrip(
  state: PlannerFlowState,
  context: AgentContext
): Promise<PlannerFlowState> {
  if (!context.tripId) return state;
  if (!context.userId) return state;
  if (state.destinations.length > 0) return state;

  try {
    const seed = await getPlannerTripSeedForUser(context.userId, context.tripId);
    if (!seed) return state;

    const destinations = normalizeDestinations(seed.destinationTitles);

    if (destinations.length === 0) return state;

    return {
      ...state,
      destinations,
      destinationScope: destinations.length > 1 ? 'multi_city' : 'city',
      needsCities: false,
      // Prevent auto-regeneration only when the trip already has persisted itinerary days.
      // Anchors alone are not enough to assume an itinerary was generated.
      hasGenerated: state.hasGenerated || seed.hasPersistedItineraryDays,
    };
  } catch (error) {
    console.warn('[PlanningAgent] Failed to seed planner state from trip', {
      tripId: context.tripId,
      error: error instanceof Error ? error.message : String(error),
    });
    return state;
  }
}

export const PlannerDeltaSchema = z.object({
  destinations: z.array(z.string()),
  destinationScope: z.enum(['city', 'multi_city', 'country', 'region', 'unknown']),
  needsCities: z.boolean(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  durationDays: z.number().int().positive().nullable(),
  goalTheme: z.string().nullable(),
  partySize: z.number().int().positive().nullable(),
  partyType: z.string().nullable(),
  budget: z.enum(['budget', 'mid', 'premium']).nullable(),
  pace: z.enum(['relaxed', 'balanced', 'packed']).nullable(),
  mustSee: z.array(z.string()).nullable(),
  avoid: z.array(z.string()).nullable(),
  lodgingArea: z.string().nullable(),
  transportPreference: z.string().nullable(),
  dailyStartPreference: z.string().nullable(),
  latestEndTime: z.string().nullable(),
  foodPreferences: z.array(z.string()).nullable(),
  accessibilityNeeds: z.string().nullable(),
  hostExperiences: z.boolean().nullable(),
  hostExperiencesPerCity: z.number().int().positive().nullable(),
});

export type PlannerDelta = z.infer<typeof PlannerDeltaSchema>;

export function destinationsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const norm = (value: string) => value.trim().toLowerCase();
  return a.every((value, index) => norm(value) === norm(b[index]));
}

export function mergeUnique(
  base: string[] | undefined,
  incoming: string[] | null | undefined
): string[] | undefined {
  if (incoming === null || incoming === undefined) return base;
  if (incoming.length === 0) return [];
  if (!base || base.length === 0) return incoming;
  const seen = new Set(base.map((value) => value.toLowerCase()));
  const merged = [...base];
  incoming.forEach((value) => {
    if (!seen.has(value.toLowerCase())) {
      merged.push(value);
      seen.add(value.toLowerCase());
    }
  });
  return merged;
}

export function buildPlannerRequest(state: PlannerFlowState): string {
  const destinations = state.destinations;
  const transportPref = state.transportPreference?.toLowerCase() ?? '';
  const isDrivePreference = transportPref.includes('drive') || transportPref.includes('car');
  const isRoadTrip = destinations.length > 1 && isDrivePreference;
  const isFlightPreference =
    transportPref.includes('flight') || transportPref.includes('fly') || transportPref.includes('air');
  const isTrainPreference = transportPref.includes('train') || transportPref.includes('rail');
  const isBoatPreference =
    transportPref.includes('boat') || transportPref.includes('ferry') || transportPref.includes('ship');
  const destinationText =
    destinations.length > 1
      ? isRoadTrip && destinations.length === 2
        ? `Plan a road trip from ${destinations[0]} to ${destinations[1]}. Include intermediate overnight cities between them.`
        : isRoadTrip
          ? `Plan a road trip visiting ${destinations.join(', ')} in that order.`
          : `Plan a trip visiting ${destinations.join(', ')} in that order.`
      : destinations.length === 1
        ? `Plan a trip to ${destinations[0]}.`
        : 'Plan a trip.';

  const dateText =
    state.startDate && state.endDate
      ? `Dates: ${state.startDate} to ${state.endDate}.`
      : state.durationDays
        ? `Duration: ${state.durationDays} days.`
        : 'Dates not set yet.';

  const preferenceLines = [
    state.goalTheme ? `Theme: ${state.goalTheme}.` : null,
    state.partySize || state.partyType
      ? `Party: ${state.partySize ?? ''} ${state.partyType ?? ''}`.trim() + '.'
      : null,
    state.budget ? `Budget: ${state.budget}.` : null,
    state.pace ? `Pace: ${state.pace}.` : null,
    state.mustSeeProvided
      ? `Must-see: ${state.mustSee && state.mustSee.length ? state.mustSee.join(', ') : 'none'}.`
      : null,
    state.avoidProvided
      ? `Avoid: ${state.avoid && state.avoid.length ? state.avoid.join(', ') : 'none'}.`
      : null,
    state.lodgingArea ? `Lodging area/constraints: ${state.lodgingArea}.` : null,
    state.transportPreference ? `Transport between cities: ${state.transportPreference}.` : null,
    state.dailyStartPreference || state.latestEndTime
      ? `Daily schedule: ${state.dailyStartPreference ?? 'flexible'}${state.latestEndTime ? `, latest end ${state.latestEndTime}` : ''}.`
      : null,
    state.foodPreferencesProvided
      ? `Food preferences: ${state.foodPreferences && state.foodPreferences.length ? state.foodPreferences.join(', ') : 'none'}.`
      : null,
    state.accessibilityNeeds ? `Accessibility: ${state.accessibilityNeeds}.` : null,
    typeof state.hostExperiences === 'boolean'
      ? `Host experiences: ${state.hostExperiences ? `yes${state.hostExperiencesPerCity ? `, ${state.hostExperiencesPerCity} per city` : ''}` : 'no'}.`
      : null,
  ].filter(Boolean);

  const preferenceText = preferenceLines.length > 0 ? ` ${preferenceLines.join(' ')}` : '';
  const multiCityLine =
    destinations.length > 1
      ? ' Include at least one day per city and set day city explicitly.'
      : '';
  const roadTripLine = isRoadTrip
    ? ' Do not use flights. Include driveable distances (aim for 5-6 hours max per day) and add intermediate overnight cities. Each day should progress toward the destination and avoid backtracking.'
    : '';
  const flightLine =
    !isRoadTrip && isFlightPreference && destinations.length > 1
      ? ' Prefer flights between cities.'
      : '';
  const trainLine =
    !isRoadTrip && isTrainPreference && destinations.length > 1
      ? ' Prefer trains between cities.'
      : '';
  const boatLine =
    !isRoadTrip && isBoatPreference && destinations.length > 1
      ? ' Prefer ferries or boats between cities.'
      : '';
  return `${destinationText} ${dateText}${preferenceText} Keep each day city-based with real sights.${multiCityLine}${roadTripLine}${flightLine}${trainLine}${boatLine}`;
}

export type PlannerQuestionKey =
  | 'destination'
  | 'cities'
  | 'dates'
  | 'goalTheme'
  | 'party'
  | 'budget'
  | 'pace'
  | 'mustSee'
  | 'avoid'
  | 'lodgingArea'
  | 'transportPreference'
  | 'dailySchedule'
  | 'foodPreferences'
  | 'accessibility'
  | 'hostExperiences'
  | 'hostExperiencesPerCity';

export function getPlannerQuestion(
  state: PlannerFlowState,
  userMessage: string
): { key: PlannerQuestionKey; question: string } | null {
  if (state.destinations.length === 0) {
    return {
      key: 'destination',
      question:
        'Welcome to Localhost — your AI-first travel planner. Where do you want to go?',
    };
  }
  if (state.needsCities) {
    const label = state.destinations[0] || 'that region';
    return { key: 'cities', question: `Which cities in ${label} should I include?` };
  }
  if (!state.startDate || !state.endDate) {
    if (!state.durationDays) {
      const unsure = /\b(not sure|no idea|not certain|unsure)\b/i.test(userMessage);
      return {
        key: 'dates',
        question: unsure
          ? 'How many days should I plan for?'
          : 'What are your start and end dates? If you are not sure, how many days?',
      };
    }
  }
  return null;
}
