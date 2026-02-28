import { openai } from '@ai-sdk/openai';
import { streamText, tool, stepCountIs, type ModelMessage, generateObject } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  createOrchestratorJob,
  updateOrchestratorJob,
  resetOrchestratorJob,
} from '@/lib/ai/orchestrator-jobs';
import { jobWriteQueue } from '@/lib/ai/job-write-queue';
import type { DraftItinerary } from '@/lib/ai/orchestrator';
import { buildHostMarkersFromPlan } from '@/lib/ai/host-markers';
import { 
  semanticSearchHosts, 
  semanticSearchExperiences, 
  type SearchIntent 
} from '@/lib/semantic-search';
import { Agent, AgentContext, type AgentStreamResult } from './agent';
import { OPENAI_PLANNING_MODEL } from '@/lib/ai/model-config';
import { conversationController } from '@/lib/conversation/controller';
import {
  detectRoadTripIntent,
  detectTransportPreference,
  extractFromToDestinations,
  normalizeDestinations,
} from './planner-helpers';
import { GenerationController, type GenerationTask, type PlannerSnapshot as ControllerPlannerSnapshot } from './generation-controller';

import { convertPlanToGlobeData, mapTransportPreferenceToMode, extractTransportPreference } from '@/lib/ai/plan-converter';
import { convertGlobeDestinationsToApiPayload } from '@/lib/api/trip-converter';
import { generateTripTitleFromPlan } from '@/lib/trips/title';
import { persistTripPlanAsUser } from '@/lib/trips/persistence';

// System prompt that handles semantic search and itinerary planning
const SYSTEM_PROMPT = `You are a friendly, helpful travel planner for Localhost, a platform that connects travelers with locals and authentic experiences.

CRITICAL TOOL RULES - ALWAYS FOLLOW THESE:

1. **FOLLOW PLANNER FLOW INSTRUCTIONS**
   The system will include a Planner Flow Instructions block. Follow it exactly.
   If it says to call \`flyToLocation\`, \`generateItinerary\`, \`getCurrentItinerary\`, or \`updateItinerary\`, you MUST do so.
   If it says not to, you MUST NOT call those tools.

2. **HOSTS/EXPERIENCES → Use semanticSearch tool**
   For finding hosts or experiences, use semanticSearch with appropriate searchType.

3. **EXISTING ITINERARY EDITS → Use updateItinerary**
   If the user wants to remove or exclude places/activities from an existing itinerary, call \`updateItinerary\`.
   Example: "I don't like Barstow in my itinerary" should trigger \`updateItinerary\`.

Your role depends on the MODE indicated in the user's message:

**LOCALS MODE** (when message contains "[Mode: locals]"):
- Use semanticSearch with searchType "hosts"

**EXPERIENCES MODE** (when message contains "[Mode: experiences]"):
- Use semanticSearch with searchType "experiences"

**ITINERARY MODE** (default):
- Use generateItinerary for new trip planning or full regeneration
- Use getCurrentItinerary when you need current plan context
- Use updateItinerary for edits to an existing itinerary
- Use flyToLocation for location viewing

Guidelines:
- ALWAYS call tools BEFORE responding with text about locations
- Keep text responses blunt and brief AFTER tool execution
- Never pretend to fly somewhere without calling flyToLocation

STYLE RULES (STRICT):
- Be warm, calm, and professional. Keep responses concise and practical.
- Do NOT provide multiple options unless the user explicitly asks.
- Ask at most one question. If Planner Flow Instructions include a question intent, ask a single friendly question that covers it. You may rephrase, but keep the meaning.
- No emojis, no exclamation points, no filler.
- For trip planning, do NOT narrate the itinerary in chat. The UI will show details.
- Trip days should be city-based with real sights/POIs (not travel-day activities).`;

const PLANNER_ONBOARDING_START_TOKEN = 'ACTION:START_PLANNER';
const DEBUG_ORCHESTRATOR_PROGRESS =
  process.env.DEBUG_ORCHESTRATOR_PROGRESS === '1' || process.env.DEBUG_ORCHESTRATOR_JOBS === '1';

function logPlannerProgressDebug(event: string, payload: Record<string, unknown>) {
  if (!DEBUG_ORCHESTRATOR_PROGRESS) return;
  console.info(`[planning-agent][progress] ${event}`, payload);
}



type PlannerFlowState = {
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

const DEFAULT_PLANNER_STATE: PlannerFlowState = {
  destinations: [],
  destinationScope: 'unknown',
  needsCities: false,
  mustSeeProvided: false,
  avoidProvided: false,
  foodPreferencesProvided: false,
  hasGenerated: false,
  hasFlown: false,
};

type PlannerGenerationSnapshot = ControllerPlannerSnapshot & {
  sessionId: string;
  tripId: string | null;
  userId: string | null;
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

function buildPlannerGenerationSnapshot(params: {
  request: string;
  sessionId: string;
  tripId: string | null;
  userId: string | null;
  state: PlannerFlowState;
}): PlannerGenerationSnapshot {
  return {
    request: params.request,
    createdAt: Date.now(),
    sessionId: params.sessionId,
    tripId: params.tripId,
    userId: params.userId,
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

function isPlannerOnboardingTriggerMessage(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed === PLANNER_ONBOARDING_START_TOKEN ||
    trimmed.startsWith(`${PLANNER_ONBOARDING_START_TOKEN}:`)
  );
}

async function seedPlannerStateFromTrip(
  state: PlannerFlowState,
  context: AgentContext
): Promise<PlannerFlowState> {
  if (!context.tripId) return state;
  if (!context.userId) return state;
  if (state.destinations.length > 0) return state;

  try {

    const trip = await prisma.trip.findFirst({
      where: {
        id: context.tripId,
        userId: context.userId,
      },
      select: {
        id: true,
      },
    });

    if (!trip) return state;

    const tripAnchors = await prisma.tripAnchor.findMany({
      where: { tripId: trip.id },
      orderBy: { order: 'asc' },
      select: { title: true },
    });

    const destinations = normalizeDestinations(
      tripAnchors
        .map((stop) => stop.title)
        .filter((title): title is string => typeof title === 'string' && title.trim().length > 0)
    );

    if (destinations.length === 0) return state;

    return {
      ...state,
      destinations,
      destinationScope: destinations.length > 1 ? 'multi_city' : 'city',
      needsCities: false,
      // Existing trip anchors indicate a persisted plan (or prior generated itinerary)
      // so the planner handshake should not auto-trigger generateItinerary again.
      hasGenerated: true,
    };
  } catch (error) {
    console.warn('[PlanningAgent] Failed to seed planner state from trip', {
      tripId: context.tripId,
      error: error instanceof Error ? error.message : String(error),
    });
    return state;
  }
}

const PlannerDeltaSchema = z.object({
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

type PlannerDelta = z.infer<typeof PlannerDeltaSchema>;

function destinationsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const norm = (value: string) => value.trim().toLowerCase();
  return a.every((value, index) => norm(value) === norm(b[index]));
}

function mergeUnique(
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

function normalizeTextForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeStrings(values: string[]): string[] {
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
  if (
    normalized === 'itinerary' ||
    normalized === 'trip' ||
    normalized === 'plan' ||
    normalized === 'that' ||
    normalized === 'this'
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
  const hasEditVerb = /\b(remove|delete|drop|skip|exclude|without|don['’]t like|do not like|hate|not a fan of)\b/i.test(
    normalized
  );
  const hasItineraryContext = /\b(itinerary|plan|trip|day)\b/i.test(normalized);
  return hasEditVerb && hasItineraryContext;
}

export function detectItineraryReadIntent(message: string): boolean {
  const normalized = message.toLowerCase();
  const hasItineraryContext = /\b(itinerary|plan|trip)\b/i.test(normalized);
  const hasReadCue = /\b(show|list|what|current|existing|planned|review|summary|summarize|see)\b/i.test(
    normalized
  );
  const hasDirectQuestion = /\bwhat(?:'s| is)\s+(?:in|on)\s+(?:my|the)\s+(itinerary|plan|trip)\b/i.test(
    normalized
  );
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

export type TripPlanItemSnapshot = {
  type: 'SIGHT' | 'EXPERIENCE' | 'MEAL' | 'FREE_TIME' | 'TRANSPORT' | 'NOTE' | 'LODGING';
  title: string;
  description: string | null;
  startTime: Date | null;
  endTime: Date | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  experienceId: string | null;
  hostId: string | null;
  createdByAI: boolean;
};

export type TripPlanDaySnapshot = {
  dayIndex: number;
  date: Date | null;
  title: string | null;
  suggestedHosts: unknown[];
  items: TripPlanItemSnapshot[];
};

export type TripPlanStopSnapshot = {
  title: string;
  type: 'CITY' | 'REGION' | 'ROAD_TRIP' | 'TRAIL';
  locations: Array<{
    name: string;
    lat: number;
    lng: number;
    placeId?: string;
  }>;
  days: TripPlanDaySnapshot[];
};

type TripAnchorForUpdateRecord = {
  title: string;
  type: TripPlanStopSnapshot['type'];
  locations: unknown;
  days: Array<{
    dayIndex: number;
    date: Date | null;
    title: string | null;
    suggestedHosts: unknown;
    items: Array<{
      type: TripPlanItemSnapshot['type'];
      title: string;
      description: string | null;
      startTime: Date | null;
      endTime: Date | null;
      locationName: string | null;
      lat: number | null;
      lng: number | null;
      experienceId: string | null;
      hostId: string | null;
      createdByAI: boolean;
    }>;
  }>;
};

type TripSummaryRecord = {
  id: string;
  title: string;
  status: string;
};

type TripPlanSnapshot = {
  trip: TripSummaryRecord;
  stops: TripPlanStopSnapshot[];
};

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

function coerceLocations(
  value: unknown
): Array<{ name: string; lat: number; lng: number; placeId?: string }> {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const candidate = entry as {
        name?: unknown;
        lat?: unknown;
        lng?: unknown;
        placeId?: unknown;
      };
      if (
        typeof candidate.name !== 'string' ||
        typeof candidate.lat !== 'number' ||
        typeof candidate.lng !== 'number'
      ) {
        return null;
      }
      return {
        name: candidate.name,
        lat: candidate.lat,
        lng: candidate.lng,
        placeId: typeof candidate.placeId === 'string' ? candidate.placeId : undefined,
      };
    })
    .filter(
      (entry): entry is NonNullable<typeof entry> =>
        entry !== null
    );
  return normalized;
}

function coerceSuggestedHosts(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mapTripAnchorsToStopSnapshots(
  tripAnchors: TripAnchorForUpdateRecord[]
): TripPlanStopSnapshot[] {
  return tripAnchors.map((stop) => {
    const locations = coerceLocations(stop.locations);
    return {
      title: stop.title,
      type: stop.type,
      locations:
        locations.length > 0
          ? locations
          : [{ name: stop.title, lat: 0, lng: 0 }],
      days: stop.days.map((day) => ({
        dayIndex: day.dayIndex,
        date: day.date,
        title: day.title,
        suggestedHosts: coerceSuggestedHosts(day.suggestedHosts),
        items: day.items.map((item) => ({
          type: item.type,
          title: item.title,
          description: item.description,
          startTime: item.startTime,
          endTime: item.endTime,
          locationName: item.locationName,
          lat: item.lat,
          lng: item.lng,
          experienceId: item.experienceId,
          hostId: item.hostId,
          createdByAI: item.createdByAI,
        })),
      })),
    };
  });
}

async function loadTripPlanSnapshot(
  userId: string,
  tripId: string
): Promise<TripPlanSnapshot | null> {
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      userId,
    },
    select: {
      id: true,
      title: true,
      status: true,
    },
  });
  if (!trip) return null;

  const tripAnchors = (await prisma.tripAnchor.findMany({
    where: { tripId: trip.id },
    orderBy: { order: 'asc' },
    include: {
      days: {
        orderBy: { dayIndex: 'asc' },
        include: {
          items: {
            orderBy: { orderIndex: 'asc' },
          },
        },
      },
    },
  })) as unknown as TripAnchorForUpdateRecord[];

  return {
    trip: {
      id: trip.id,
      title: trip.title,
      status: trip.status,
    },
    stops: mapTripAnchorsToStopSnapshots(tripAnchors),
  };
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

function getRemovalCount(stats: ItineraryRemovalStats): number {
  return stats.removedStops.length + stats.removedDays.length + stats.removedItems.length;
}

function formatRemovalSummary(stats: ItineraryRemovalStats): string {
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

async function persistUpdatedTripStops(
  tripId: string,
  stops: TripPlanStopSnapshot[]
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.tripAnchor.deleteMany({
      where: { tripId },
    });

    let dayCounter = 1;
    for (let stopIndex = 0; stopIndex < stops.length; stopIndex += 1) {
      const stop = stops[stopIndex];
      const createdAnchor = await tx.tripAnchor.create({
        data: {
          tripId,
          title: stop.title,
          type: stop.type,
          locations: stop.locations,
          order: stopIndex,
        },
      });

      for (const day of stop.days) {
        const createdDay = await tx.itineraryDay.create({
          data: {
            tripAnchorId: createdAnchor.id,
            dayIndex: dayCounter,
            date: day.date,
            title: day.title,
            suggestedHosts: day.suggestedHosts,
          },
        });
        dayCounter += 1;

        for (let itemIndex = 0; itemIndex < day.items.length; itemIndex += 1) {
          const item = day.items[itemIndex];
          await tx.itineraryItem.create({
            data: {
              dayId: createdDay.id,
              type: item.type,
              title: item.title,
              description: item.description,
              startTime: item.startTime,
              endTime: item.endTime,
              locationName: item.locationName,
              lat: item.lat,
              lng: item.lng,
              experienceId: item.experienceId,
              hostId: item.hostId,
              orderIndex: itemIndex,
              createdByAI: item.createdByAI,
            },
          });
        }
      }
    }

    await tx.trip.update({
      where: { id: tripId },
      data: { status: 'PLANNED' },
    });
  });
}

export function buildPlannerRequest(state: PlannerFlowState): string {
  const destinations = state.destinations;
  const transportPref = state.transportPreference?.toLowerCase() ?? '';
  const isDrivePreference = transportPref.includes('drive') || transportPref.includes('car');
  const isRoadTrip = destinations.length > 1 && isDrivePreference;
  const isFlightPreference = transportPref.includes('flight') || transportPref.includes('fly') || transportPref.includes('air');
  const isTrainPreference = transportPref.includes('train') || transportPref.includes('rail');
  const isBoatPreference = transportPref.includes('boat') || transportPref.includes('ferry') || transportPref.includes('ship');
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

  const dateText = state.startDate && state.endDate
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
  const flightLine = !isRoadTrip && isFlightPreference && destinations.length > 1
    ? ' Prefer flights between cities.'
    : '';
  const trainLine = !isRoadTrip && isTrainPreference && destinations.length > 1
    ? ' Prefer trains between cities.'
    : '';
  const boatLine = !isRoadTrip && isBoatPreference && destinations.length > 1
    ? ' Prefer ferries or boats between cities.'
    : '';
  return `${destinationText} ${dateText}${preferenceText} Keep each day city-based with real sights.${multiCityLine}${roadTripLine}${flightLine}${trainLine}${boatLine}`;
}

type PlannerQuestionKey =
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
  if (!state.goalTheme) {
    return { key: 'goalTheme', question: 'What is the trip’s primary goal or theme?' };
  }
  if (!state.partySize && !state.partyType) {
    return {
      key: 'party',
      question: 'What is your travel party size and composition (solo, couple, family, friends, etc.)?',
    };
  }
  if (!state.budget) {
    return { key: 'budget', question: 'Budget level: budget, mid, or premium?' };
  }
  if (!state.pace) {
    return { key: 'pace', question: 'Preferred pace: relaxed, balanced, or packed?' };
  }
  if (!state.mustSeeProvided) {
    return { key: 'mustSee', question: 'Must-see places or experiences?' };
  }
  if (!state.avoidProvided) {
    return { key: 'avoid', question: 'Things to avoid?' };
  }
  if (!state.lodgingArea) {
    return { key: 'lodgingArea', question: 'Preferred lodging area or constraints?' };
  }
  if (!state.transportPreference) {
    return {
      key: 'transportPreference',
      question: 'Transport between cities: train, flight, drive, or no preference?',
    };
  }
  if (!state.dailyStartPreference && !state.latestEndTime) {
    return {
      key: 'dailySchedule',
      question: 'Daily schedule preferences: early start or late start, and latest end time?',
    };
  }
  if (!state.foodPreferencesProvided) {
    return { key: 'foodPreferences', question: 'Food preferences or restrictions?' };
  }
  if (!state.accessibilityNeeds) {
    return { key: 'accessibility', question: 'Accessibility or mobility needs?' };
  }
  if (typeof state.hostExperiences !== 'boolean') {
    return {
      key: 'hostExperiences',
      question: 'Do you want host experiences included, and if so how many per city?',
    };
  }
  if (state.hostExperiences && !state.hostExperiencesPerCity) {
    return { key: 'hostExperiencesPerCity', question: 'How many host experiences per city?' };
  }
  return null;
}

type HydrationTotals = {
  geocodes: number;
  routes: number;
  hosts: number;
};

function getHydrationTotals(draft: DraftItinerary): HydrationTotals {
  // During planTripFromDraft, processDay calls resolve_place for:
  // 1. The day anchor (often 1 call, but sometimes 2 if fallback city center is needed)
  // 2. Each activity
  // Since we can't perfectly predict the fallback, we use activities + 1 as a baseline
  // and ensure the progress bar completes even if the exact number varies slightly.
  const geocodes = draft.days.reduce((sum, day) => sum + day.activities.length + 1, 0);
  const routes = draft.days.filter((day) => day.activities.length > 1).length;
  const hosts = draft.days.length;
  return { geocodes, routes, hosts };
}

function buildProgress(
  geocoded: number,
  totals: HydrationTotals,
  routed: number,
  hosted: number,
  isHydrationComplete: boolean = false
) {
  if (!isHydrationComplete && geocoded < totals.geocodes) {
    return {
      stage: 'geocoding' as const,
      message: 'Hydrating places',
      current: Math.min(geocoded, totals.geocodes),
      total: totals.geocodes,
    };
  }

  if (totals.routes > 0 && routed < totals.routes) {
    return {
      stage: 'routing' as const,
      message: 'Building routes',
      current: routed,
      total: totals.routes,
    };
  }

  if (totals.hosts > 0 && hosted < totals.hosts) {
    return {
      stage: 'hosts' as const,
      message: 'Finding hosts',
      current: hosted,
      total: totals.hosts,
    };
  }

  return {
    stage: 'final' as const,
    message: 'Finalizing plan',
  };
}

function getGenerationStartMessage(mode: 'draft' | 'refine'): string {
  return mode === 'draft' ? 'Drafting your trip...' : 'Refining your trip...';
}

function getQueuedMessage(): string {
  return 'Got it. I will apply your latest updates after this pass.';
}

async function runPlannerGenerationTask(
  task: GenerationTask<PlannerGenerationSnapshot>
) {
  const { ItineraryOrchestrator } = await import('@/lib/ai/orchestrator');
  const { jobId, mode, snapshot, signal, isLatest, generationId } = task;
  const shouldIgnore = () => signal.aborted || !isLatest();

  try {
    const orchestrator = new ItineraryOrchestrator();
    const startTime = Date.now();
    const draftResult = await orchestrator.planTripDraft(snapshot.request);
    console.log(
      `[PlanningAgent] planTripDraft completed in ${Date.now() - startTime}ms (${mode})`
    );

    if (shouldIgnore()) {
      return;
    }

    if (!draftResult.plan) {
      logPlannerProgressDebug('draft.missing-plan', {
        jobId,
        generationId,
        mode,
      });
      await jobWriteQueue.flush(jobId, {
        status: 'error',
        error: 'Unable to locate the main city for this trip.',
        expectedGenerationId: generationId,
        progress: { stage: 'error', message: 'Unable to locate the main city for this trip.' },
      });
      return;
    }

    logPlannerProgressDebug('draft.write.start', {
      jobId,
      generationId,
      mode,
      days: draftResult.plan.days.length,
      title: draftResult.plan.title,
    });
    const draftWriteResult = await updateOrchestratorJob(jobId, {
      status: 'draft',
      plan: draftResult.plan,
      expectedGenerationId: generationId,
      progress: {
        stage: 'draft',
        message: `Draft ready: ${draftResult.plan.title}`,
      },
    });
    logPlannerProgressDebug('draft.write.result', {
      jobId,
      generationId,
      applied: draftWriteResult.applied,
      reason: draftWriteResult.reason,
      rowStatus: draftWriteResult.row?.status ?? null,
      rowStage: draftWriteResult.row?.progress.stage ?? null,
      rowGenerationId: draftWriteResult.row?.generationId ?? null,
      rowUpdatedAt: draftWriteResult.row?.updatedAt ?? null,
    });

    const totals = getHydrationTotals(draftResult.context.draft);
    let geocoded = 0;
    let routed = 0;
    let hosted = 0;
    let progressWriteSeq = 0;

    const updateProgress = () => {
      if (shouldIgnore()) return;
      const progress = buildProgress(geocoded, totals, routed, hosted);
      const seq = ++progressWriteSeq;
      logPlannerProgressDebug('progress.enqueue', {
        jobId,
        generationId,
        seq,
        progress,
        counters: {
          geocoded,
          routed,
          hosted,
          geocodeTotal: totals.geocodes,
          routeTotal: totals.routes,
          hostTotal: totals.hosts,
        },
      });
      jobWriteQueue.enqueue(jobId, { status: 'running', expectedGenerationId: generationId, progress });
    };

    const hydrationOrchestrator = new ItineraryOrchestrator(undefined, {
      onToolResult: (toolName) => {
        if (shouldIgnore()) return;
        if (toolName === 'resolve_place') geocoded += 1;
        if (toolName === 'generate_route') routed += 1;
        if (toolName === 'search_localhosts') hosted += 1;
        logPlannerProgressDebug('tool.result', {
          jobId,
          generationId,
          toolName,
          counters: { geocoded, routed, hosted },
        });
        updateProgress();
      },
    });

    updateProgress();
    const plan = await hydrationOrchestrator.planTripFromDraft(
      snapshot.request,
      draftResult.context.draft,
      draftResult.context.tripAnchor,
      draftResult.context.inventory
    );
    if (shouldIgnore()) return;

    const hostMarkers = buildHostMarkersFromPlan(plan);
    logPlannerProgressDebug('complete.flush.start', {
      jobId,
      generationId,
      hostMarkerCount: hostMarkers.length,
      dayCount: plan.days.length,
    });
    if (snapshot.tripId) {
      if (!snapshot.userId) {
        throw new Error(
          `Missing user context for planner persistence (tripId=${snapshot.tripId})`
        );
      }
      logPlannerProgressDebug('complete.persist.start', {
        jobId,
        generationId,
        tripId: snapshot.tripId,
      });
      try {
        const { destinations } = convertPlanToGlobeData(plan);
        const { stops } = convertGlobeDestinationsToApiPayload(destinations);
        const title = generateTripTitleFromPlan(plan);
        const transportPreference = mapTransportPreferenceToMode(
          extractTransportPreference(plan.request)
        );
        const preferences = transportPreference ? { transportPreference } : undefined;
        await persistTripPlanAsUser({
          tripId: snapshot.tripId,
          userId: snapshot.userId,
          stops,
          preferences,
          title,
          audit: {
            source: 'planner',
            actor: 'planning-agent',
            jobId,
            generationId,
            reason: 'planner_generation_complete',
          },
        });
        logPlannerProgressDebug('complete.persist.success', {
          jobId,
          generationId,
        });
      } catch (persistError) {
        logPlannerProgressDebug('complete.persist.error', {
          jobId,
          generationId,
          error: persistError instanceof Error ? persistError.message : String(persistError),
        });
        throw persistError; // Caught by outer block, sets status to 'error'
      }
    }

    const completeResult = await jobWriteQueue.flush(jobId, {
      status: 'complete',
      plan,
      hostMarkers,
      expectedGenerationId: generationId,
      progress: { stage: 'complete', message: 'Plan ready' },
    });
    logPlannerProgressDebug('complete.flush.result', {
      jobId,
      generationId,
      applied: completeResult.applied,
      reason: completeResult.reason,
      rowStatus: completeResult.row?.status ?? null,
      rowStage: completeResult.row?.progress.stage ?? null,
      rowGenerationId: completeResult.row?.generationId ?? null,
      rowUpdatedAt: completeResult.row?.updatedAt ?? null,
    });
  } catch (error) {
    if (shouldIgnore()) return;
    const errorMsg = error instanceof Error ? error.message : 'Failed to generate itinerary.';
    logPlannerProgressDebug('generation.error', {
      jobId,
      generationId,
      mode,
      error: errorMsg,
    });
    await jobWriteQueue.flush(jobId, {
      status: 'error',
      error: errorMsg,
      expectedGenerationId: generationId,
      progress: { stage: 'error', message: errorMsg },
    });
  }
}

const plannerGenerationController = new GenerationController<PlannerGenerationSnapshot>({
  refineDebounceMs: 600,
  ensureJobId: async ({ existingJobId, snapshot, mode, generationId }) => {
    const progress = {
      stage: 'draft' as const,
      message: getGenerationStartMessage(mode),
    };

    if (existingJobId) {
      const reset = await resetOrchestratorJob(existingJobId, {
        prompt: snapshot.request,
        progress,
        generationId,
        generationMode: mode,
      });
      if (reset) return reset.id;
    }

    const created = await createOrchestratorJob(snapshot.request, progress, {
      generationId,
      generationMode: mode,
    });
    return created.id;
  },
  onQueued: async ({ jobId, generationId }) => {
    if (!generationId) {
      logPlannerProgressDebug('queued.skipped-missing-generation', { jobId });
      return;
    }
    jobWriteQueue.enqueue(jobId, {
      status: 'running',
      expectedGenerationId: generationId,
      progress: {
        stage: 'final',
        message: getQueuedMessage(),
      },
    });
  },
  runGeneration: runPlannerGenerationTask,
});

export class PlanningAgent implements Agent {
  name = 'planning';
  description = 'Helps users plan trips and find hosts';

  async process(
    messages: Array<{ role?: string; content?: string | Array<{ type?: string; text?: string }> }>,
    context: AgentContext
  ): Promise<AgentStreamResult> {
    // Get the last user message text
    const lastUserMessage = messages[messages.length - 1];
    const userMessageText = typeof lastUserMessage?.content === 'string'
      ? lastUserMessage.content
      : (Array.isArray(lastUserMessage?.content)
          ? lastUserMessage.content
              .map((p) => (p.type === 'text' ? p.text ?? '' : ''))
              .join(' ')
          : '');

    const isLocalsMode = userMessageText.includes('[Mode: locals]');
    const isExperiencesMode = userMessageText.includes('[Mode: experiences]');
    const isPlannerMode = !isLocalsMode && !isExperiencesMode;

    const sessionId = context.sessionId ?? 'planner-session';
    const controllerKey = context.tripId
      ? `trip:${context.tripId}:session:${sessionId}`
      : `session:${sessionId}`;
    const session = await conversationController.getOrCreateSession(sessionId);
    const storedState = (session.metadata?.plannerState as PlannerFlowState | undefined)
      ?? DEFAULT_PLANNER_STATE;
    const currentState =
      isPlannerMode ? await seedPlannerStateFromTrip(storedState, context) : storedState;

    if (isPlannerMode && currentState !== storedState) {
      await conversationController.updateMetadata(sessionId, {
        ...session.metadata,
        plannerState: currentState,
      });
    }

    let nextState = currentState;
    let plannerDirective = 'Planner flow disabled for this mode.';
    let shouldGenerate = false;
    let shouldFly = false;
    let shouldGetCurrentItinerary = false;
    let shouldUpdateItinerary = false;
    let itineraryRequest: string | null = null;
    let itineraryUpdateRequest: string | null = null;
    let nextQuestion: string | null = null;

    if (isPlannerMode) {
      const extraction = await generateObject({
        model: openai(OPENAI_PLANNING_MODEL),
        schema: PlannerDeltaSchema,
        prompt: `
          Extract trip planning inputs from this message.
          Return destinations (cities or regions) in order of mention.
          If user mentions multiple cities, destinationScope is "multi_city".
          If user mentions a country or region without listing cities, destinationScope is "country" or "region" and needsCities = true.
          Normalize dates to YYYY-MM-DD when explicit. If unclear, omit.
          Extract durationDays if user specifies a number of days.
          Extract goalTheme, partySize, partyType, budget (budget/mid/premium), pace (relaxed/balanced/packed),
          mustSee, avoid, lodgingArea, transportPreference, dailyStartPreference, latestEndTime, foodPreferences,
          accessibilityNeeds, hostExperiences (true/false), hostExperiencesPerCity.
          If a field is not mentioned, return null (or an empty array only when the user explicitly says "none").
          Always return destinations (empty array if none yet), destinationScope ("unknown" if unclear), and needsCities (false if unclear).
          
          Message: "${userMessageText}"
        `,
      });

      const delta = extraction.object as PlannerDelta;
      const isPlannerHandshake = isPlannerOnboardingTriggerMessage(userMessageText);
      const explicitRoute = extractFromToDestinations(userMessageText);
      const roadTripIntent = detectRoadTripIntent(userMessageText);
      const explicitTransport = detectTransportPreference(userMessageText);
      const shouldInferRoadTrip =
        roadTripIntent ||
        (explicitRoute && explicitRoute.length === 2 && /\broad\s*trip\b/i.test(userMessageText));
      if (explicitRoute && explicitRoute.length === 2) {
        delta.destinations = explicitRoute;
        delta.destinationScope = 'multi_city';
        delta.needsCities = false;
      }
      if (!delta.transportPreference && explicitTransport) {
        delta.transportPreference = explicitTransport;
      }
      if (shouldInferRoadTrip && !delta.transportPreference) {
        delta.transportPreference = 'drive';
      }
      if (
        shouldInferRoadTrip &&
        !delta.durationDays &&
        !delta.startDate &&
        !delta.endDate
      ) {
        delta.durationDays = 6;
      }
      const lastQuestionKey = currentState.lastQuestionKey;
      const negativeResponse = /\b(no|none|nope|not really|nothing|no preference)\b/i.test(
        userMessageText
      );

      if (negativeResponse) {
        if (lastQuestionKey === 'mustSee' && (!delta.mustSee || delta.mustSee.length === 0)) {
          delta.mustSee = [];
        }
        if (lastQuestionKey === 'avoid' && (!delta.avoid || delta.avoid.length === 0)) {
          delta.avoid = [];
        }
        if (
          lastQuestionKey === 'foodPreferences' &&
          (!delta.foodPreferences || delta.foodPreferences.length === 0)
        ) {
          delta.foodPreferences = [];
        }
        if (lastQuestionKey === 'lodgingArea' && !delta.lodgingArea) {
          delta.lodgingArea = 'no preference';
        }
        if (lastQuestionKey === 'transportPreference' && !delta.transportPreference) {
          delta.transportPreference = 'no preference';
        }
        if (lastQuestionKey === 'dailySchedule' && !delta.dailyStartPreference) {
          delta.dailyStartPreference = 'flexible';
        }
        if (lastQuestionKey === 'accessibility' && !delta.accessibilityNeeds) {
          delta.accessibilityNeeds = 'none';
        }
        if (lastQuestionKey === 'hostExperiences' && typeof delta.hostExperiences !== 'boolean') {
          delta.hostExperiences = false;
        }
      }
      const incomingDestinations = normalizeDestinations(delta.destinations ?? []);
      const destinationsChanged =
        incomingDestinations.length > 0 &&
        !destinationsEqual(incomingDestinations, currentState.destinations);

      const shouldUpdateNeedsCities =
        incomingDestinations.length > 0 || delta.destinationScope !== 'unknown';
      const nextNeedsCities = shouldUpdateNeedsCities
        ? delta.needsCities
        : currentState.needsCities;

      const mustSeeProvided =
        currentState.mustSeeProvided ||
        (Array.isArray(delta.mustSee) && delta.mustSee.length > 0) ||
        (lastQuestionKey === 'mustSee' && delta.mustSee !== null);
      const avoidProvided =
        currentState.avoidProvided ||
        (Array.isArray(delta.avoid) && delta.avoid.length > 0) ||
        (lastQuestionKey === 'avoid' && delta.avoid !== null);
      const foodPreferencesProvided =
        currentState.foodPreferencesProvided ||
        (Array.isArray(delta.foodPreferences) && delta.foodPreferences.length > 0) ||
        (lastQuestionKey === 'foodPreferences' && delta.foodPreferences !== null);

      nextState = {
        ...currentState,
        destinations: incomingDestinations.length > 0 ? incomingDestinations : currentState.destinations,
        destinationScope:
          delta.destinationScope !== 'unknown'
            ? delta.destinationScope
            : currentState.destinationScope,
        needsCities: nextNeedsCities,
        startDate: delta.startDate ?? currentState.startDate,
        endDate: delta.endDate ?? currentState.endDate,
        durationDays: delta.durationDays ?? currentState.durationDays,
        goalTheme: delta.goalTheme ?? currentState.goalTheme,
        partySize: delta.partySize ?? currentState.partySize,
        partyType: delta.partyType ?? currentState.partyType,
        budget: delta.budget ?? currentState.budget,
        pace: delta.pace ?? currentState.pace,
        mustSee: mergeUnique(currentState.mustSee, delta.mustSee),
        mustSeeProvided,
        avoid: mergeUnique(currentState.avoid, delta.avoid),
        avoidProvided,
        lodgingArea: delta.lodgingArea ?? currentState.lodgingArea,
        transportPreference: delta.transportPreference ?? currentState.transportPreference,
        dailyStartPreference: delta.dailyStartPreference ?? currentState.dailyStartPreference,
        latestEndTime: delta.latestEndTime ?? currentState.latestEndTime,
        foodPreferences: mergeUnique(currentState.foodPreferences, delta.foodPreferences),
        foodPreferencesProvided,
        accessibilityNeeds: delta.accessibilityNeeds ?? currentState.accessibilityNeeds,
        hostExperiences: typeof delta.hostExperiences === 'boolean' ? delta.hostExperiences : currentState.hostExperiences,
        hostExperiencesPerCity: delta.hostExperiencesPerCity ?? currentState.hostExperiencesPerCity,
      };

      if (
        nextState.destinations.length > 1 &&
        !nextState.transportPreference &&
        !shouldInferRoadTrip &&
        nextState.destinationScope === 'multi_city'
      ) {
        nextState = {
          ...nextState,
          transportPreference: 'flight',
        };
      }

      // Do NOT clear existing preferences when destinations change.

      if (shouldInferRoadTrip) {
        nextState = {
          ...nextState,
          transportPreference: nextState.transportPreference ?? 'drive',
          durationDays: nextState.durationDays ?? 6,
        };
      }

      const hasDestination = nextState.destinations.length > 0;
      const preferenceChanged =
        delta.goalTheme ||
        delta.partySize ||
        delta.partyType ||
        delta.budget ||
        delta.pace ||
        delta.mustSee !== null ||
        delta.avoid !== null ||
        delta.lodgingArea ||
        delta.transportPreference ||
        delta.dailyStartPreference ||
        delta.latestEndTime ||
        delta.foodPreferences !== null ||
        delta.accessibilityNeeds ||
        typeof delta.hostExperiences === 'boolean' ||
        delta.hostExperiencesPerCity;
      const hasPersistedTripContext = Boolean(context.tripId && context.userId);
      const wantsItineraryRead = detectItineraryReadIntent(userMessageText);
      const wantsItineraryUpdate = detectItineraryUpdateIntent(userMessageText);
      shouldGetCurrentItinerary = hasPersistedTripContext && (wantsItineraryRead || wantsItineraryUpdate);
      shouldUpdateItinerary =
        hasPersistedTripContext &&
        currentState.hasGenerated &&
        wantsItineraryUpdate;

      shouldFly = hasDestination && !nextState.hasFlown;
      if (shouldGetCurrentItinerary || shouldUpdateItinerary) {
        shouldFly = false;
      }

      shouldGenerate =
        (incomingDestinations.length > 0 && !currentState.hasGenerated) ||
        (isPlannerHandshake && currentState.destinations.length > 0 && !currentState.hasGenerated) ||
        destinationsChanged ||
        Boolean(delta.startDate && delta.endDate) ||
        Boolean(delta.durationDays) ||
        Boolean(preferenceChanged && !shouldUpdateItinerary && !wantsItineraryRead);

      if (shouldFly) {
        nextState = { ...nextState, hasFlown: true };
      }
      if (shouldGenerate) {
        nextState = { ...nextState, hasGenerated: true };
      }

      itineraryRequest = shouldGenerate ? buildPlannerRequest(nextState) : null;
      itineraryUpdateRequest = shouldUpdateItinerary ? userMessageText : null;
      const questionResult = (shouldUpdateItinerary || shouldGetCurrentItinerary)
        ? null
        : getPlannerQuestion(nextState, userMessageText);
      nextQuestion = questionResult?.question ?? null;
      const nextQuestionKey = questionResult?.key;

      const partyLine = `Party: ${nextState.partySize ?? 'unset'} ${nextState.partyType ?? ''}`.trim();
      plannerDirective = `
Planner Flow Instructions:
- Known destinations: ${nextState.destinations.length ? nextState.destinations.join(', ') : 'none'}
- Destination scope: ${nextState.destinationScope}
- Needs cities clarification: ${nextState.needsCities ? 'yes' : 'no'}
- Dates: ${nextState.startDate ?? 'unset'} to ${nextState.endDate ?? 'unset'}
- Duration days: ${nextState.durationDays ?? 'unset'}
- Goal/theme: ${nextState.goalTheme ?? 'unset'}
- ${partyLine}
- Budget: ${nextState.budget ?? 'unset'}
- Pace: ${nextState.pace ?? 'unset'}
- Must-see provided: ${nextState.mustSeeProvided ? 'yes' : 'no'}
- Avoid provided: ${nextState.avoidProvided ? 'yes' : 'no'}
- Lodging area: ${nextState.lodgingArea ?? 'unset'}
- Transport preference: ${nextState.transportPreference ?? 'unset'}
- Daily schedule: ${nextState.dailyStartPreference ?? 'unset'}${nextState.latestEndTime ? `, latest end ${nextState.latestEndTime}` : ''}
- Food preferences provided: ${nextState.foodPreferencesProvided ? 'yes' : 'no'}
- Accessibility: ${nextState.accessibilityNeeds ?? 'unset'}
- Host experiences: ${typeof nextState.hostExperiences === 'boolean' ? (nextState.hostExperiences ? 'yes' : 'no') : 'unset'}
- Host experiences per city: ${nextState.hostExperiencesPerCity ?? 'unset'}
- Call flyToLocation now: ${shouldFly ? 'yes (ONLY once, initial city/region)' : 'no'}
- Call generateItinerary now: ${shouldGenerate ? 'yes' : 'no'}
- Call getCurrentItinerary now: ${shouldGetCurrentItinerary ? 'yes' : 'no'}
- Call updateItinerary now: ${shouldUpdateItinerary ? 'yes' : 'no'}
${itineraryRequest ? `- If calling generateItinerary, use request EXACTLY: "${itineraryRequest}"` : ''}
${itineraryUpdateRequest ? `- If calling updateItinerary, use request EXACTLY: "${itineraryUpdateRequest}"` : ''}
${nextQuestion ? `- Ask a single friendly question to cover: "${nextQuestionKey ?? 'missing info'}". Suggested wording: "${nextQuestion}"` : '- Ask no question.'}
Rules:
- If both flyToLocation and generateItinerary are required, call flyToLocation first.
- If both getCurrentItinerary and updateItinerary are required, call getCurrentItinerary first.
- Do NOT call flyToLocation unless instructed above.
- Do NOT call generateItinerary unless instructed above.
- Do NOT call getCurrentItinerary unless instructed above.
- Do NOT call updateItinerary unless instructed above.
`;

      await conversationController.updateMetadata(sessionId, {
        ...session.metadata,
        plannerState: {
          ...nextState,
          lastQuestionKey: nextQuestionKey,
        },
      });
    }

    return streamText({
      model: openai(OPENAI_PLANNING_MODEL),
      system: `${SYSTEM_PROMPT}\n\n${plannerDirective}`,
      messages: messages as ModelMessage[],
      toolChoice: 'auto',
      tools: {
        semanticSearch: tool({
          description: 'Search for hosts or experiences using semantic understanding. Extracts intent from the query and finds matches based on meaning, not just keywords. For example, "tourist spots" will match history, landmarks, and cultural experiences.',
          inputSchema: z.object({
            searchType: z.enum(['hosts', 'experiences']).describe('Whether to search for hosts/locals or experiences/activities'),
            userQuery: z.string().describe('The raw user query to understand'),
            extractedIntent: z.object({
              categories: z.array(z.string()).describe('Inferred categories: food-drink, arts-culture, outdoor-adventure, nightlife-social, wellness, learning, family'),
              keywords: z.array(z.string()).describe('Key concepts and related terms (expand tourist spots to include history, landmarks, famous, sightseeing, etc)'),
              location: z.string().optional().describe('City or country if mentioned'),
              preferences: z.array(z.string()).describe('Travel preferences mentioned'),
              activities: z.array(z.string()).describe('Specific activities'),
            }).describe('The semantic understanding of what the user wants - think about related concepts'),
            limit: z.number().optional().describe('Max results to return, default 20'),
          }),
          execute: async ({ searchType, userQuery, extractedIntent, limit = 20 }) => {
            const intent: SearchIntent = {
              categories: extractedIntent.categories,
              keywords: extractedIntent.keywords,
              location: extractedIntent.location,
              preferences: extractedIntent.preferences,
              activities: extractedIntent.activities,
            };
  
            if (searchType === 'hosts') {
              const results = semanticSearchHosts(intent, limit);
              return {
                success: true,
                searchType: 'hosts',
                resultCount: results.length,
                query: userQuery,
                intentUnderstood: extractedIntent,
                results: results.map(r => ({
                  id: r.host.id,
                  name: r.host.name,
                  city: r.host.city,
                  country: r.host.country,
                  photo: r.host.photo,
                  quote: r.host.quote,
                  interests: r.host.interests,
                  score: r.score,
                  matchReasons: r.matchReasons,
                  experienceCount: r.host.experiences.length,
                  topExperience: r.host.experiences[0]?.title,
                })),
              };
            } else {
              const results = semanticSearchExperiences(intent, limit);
              return {
                success: true,
                searchType: 'experiences',
                resultCount: results.length,
                query: userQuery,
                intentUnderstood: extractedIntent,
                results: results.map(r => ({
                  id: r.experience.id,
                  title: r.experience.title,
                  description: r.experience.description,
                  category: r.experience.category,
                  price: r.experience.price,
                  rating: r.experience.rating,
                  reviewCount: r.experience.reviewCount,
                  photo: r.experience.photos[0],
                  host: {
                    id: r.experience.hostId,
                    name: r.experience.hostName,
                    photo: r.experience.hostPhoto,
                    city: r.experience.city,
                    country: r.experience.country,
                  },
                  score: r.score,
                  matchReasons: r.matchReasons,
                })),
              };
            }
          },
        }),
  
        generateItinerary: tool({
          description: 'Generate a detailed multi-day travel itinerary. Use this when the user asks for a trip plan. This tool uses a sophisticated orchestrator to find real places, navigation, and local hosts.',
          inputSchema: z.object({
            request: z.string().describe('The user\'s travel request, e.g., "5 days in Paris for a foodie"'),
          }),
          execute: async ({ request }) => {
            try {
              const snapshot = buildPlannerGenerationSnapshot({
                request,
                sessionId,
                tripId: context.tripId ?? null,
                userId: context.userId ?? null,
                state: nextState,
              });
              const scheduled = await plannerGenerationController.schedule(
                controllerKey,
                snapshot
              );

              return {
                success: true,
                jobId: scheduled.jobId,
                tripId: context.tripId ?? undefined,
                generationId: scheduled.generationId ?? undefined,
                queued: scheduled.queued,
                mode: scheduled.mode,
                message: scheduled.queued
                  ? getQueuedMessage()
                  : getGenerationStartMessage(scheduled.mode),
              };
            } catch (error) {
              console.error('Planner generation scheduling failed:', error);
              return {
                success: false,
                error: 'Failed to generate itinerary. Please try again.',
              };
            }
          },
        }),

        getCurrentItinerary: tool({
          description:
            'Load the current persisted itinerary for the active trip so the assistant can reason about specific stops, days, and activities before making edits.',
          inputSchema: z.object({
            includeItems: z
              .boolean()
              .default(true)
              .describe('Whether to include day item details'),
            maxItemsPerDay: z
              .number()
              .int()
              .min(1)
              .max(25)
              .default(12)
              .describe('Maximum items to return per day when includeItems is true'),
          }),
          execute: async ({ includeItems = true, maxItemsPerDay = 12 }) => {
            if (!context.userId) {
              return {
                success: false,
                error: 'Authentication required to read itinerary.',
              };
            }
            if (!context.tripId) {
              return {
                success: false,
                error: 'No active trip selected.',
              };
            }

            try {
              const snapshot = await loadTripPlanSnapshot(context.userId, context.tripId);
              if (!snapshot) {
                return {
                  success: false,
                  error: 'Trip not found or access denied.',
                };
              }

              const dayCount = snapshot.stops.reduce((total, stop) => total + stop.days.length, 0);
              const itemCount = snapshot.stops.reduce(
                (total, stop) =>
                  total + stop.days.reduce((dayTotal, day) => dayTotal + day.items.length, 0),
                0
              );
              const knownPlaceNames = dedupeStrings([
                ...snapshot.stops.map((stop) => stop.title),
                ...snapshot.stops.flatMap((stop) => stop.days.map((day) => day.title ?? `Day ${day.dayIndex}`)),
                ...snapshot.stops.flatMap((stop) => stop.days.flatMap((day) => day.items.map((item) => item.title))),
              ]);

              return {
                success: true,
                tripId: snapshot.trip.id,
                title: snapshot.trip.title,
                status: snapshot.trip.status,
                summary: {
                  stopCount: snapshot.stops.length,
                  dayCount,
                  itemCount,
                },
                knownPlaceNames,
                stops: snapshot.stops.map((stop) => ({
                  title: stop.title,
                  type: stop.type,
                  dayCount: stop.days.length,
                  days: stop.days.map((day) => ({
                    dayIndex: day.dayIndex,
                    title: day.title,
                    itemCount: day.items.length,
                    items: includeItems
                      ? day.items.slice(0, maxItemsPerDay).map((item) => ({
                          title: item.title,
                          type: item.type,
                          locationName: item.locationName,
                        }))
                      : undefined,
                  })),
                })),
                message: 'Loaded current itinerary context.',
              };
            } catch (error) {
              console.error('[PlanningAgent] getCurrentItinerary failed', error);
              return {
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : 'Failed to load current itinerary.',
              };
            }
          },
        }),

        updateItinerary: tool({
          description:
            'Update an existing itinerary by removing places or activities the user no longer wants. This tool persists the updated itinerary to the trip database.',
          inputSchema: z.object({
            request: z
              .string()
              .describe('User edit request, e.g. "I do not like Barstow in my itinerary. Remove it."'),
            remove: z
              .array(z.string())
              .optional()
              .describe('Optional explicit list of places or activities to remove'),
          }),
          execute: async ({ request, remove = [] }) => {
            if (!context.userId) {
              return {
                success: false,
                error: 'Authentication required to update itinerary.',
              };
            }
            if (!context.tripId) {
              return {
                success: false,
                error: 'No active trip selected for itinerary updates.',
              };
            }

            const targets = extractItineraryRemovalTargets(request, remove);
            if (targets.length === 0) {
              return {
                success: false,
                error:
                  'No removable itinerary target was detected. Specify what should be removed.',
              };
            }

            try {
              const snapshot = await loadTripPlanSnapshot(context.userId, context.tripId);
              if (!snapshot) {
                return {
                  success: false,
                  error: 'Trip not found or access denied.',
                };
              }

              const { stops: updatedStops, stats } = removeItineraryTargetsFromStops(
                snapshot.stops,
                targets
              );
              if (getRemovalCount(stats) === 0) {
                return {
                  success: true,
                  updated: false,
                  tripId: snapshot.trip.id,
                  targets,
                  removed: stats,
                  message: 'No matching itinerary entries were found to remove.',
                };
              }

              if (updatedStops.length === 0) {
                return {
                  success: false,
                  error:
                    'This update would remove the entire itinerary. Provide a more specific removal target.',
                };
              }

              await persistUpdatedTripStops(snapshot.trip.id, updatedStops);

              return {
                success: true,
                updated: true,
                tripId: snapshot.trip.id,
                targets,
                removed: stats,
                message: formatRemovalSummary(stats),
              };
            } catch (error) {
              console.error('[PlanningAgent] updateItinerary failed', error);
              return {
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : 'Failed to update itinerary.',
              };
            }
          },
        }),
        
        navigate: tool({
          description: 'Navigate the user to a specific page with search results. Use after showing semantic search results.',
          inputSchema: z.object({
            page: z.enum(['home', 'hosts', 'host-profile', 'explore']).describe('The page to navigate to'),
            hostId: z.string().optional().describe('Host ID, required when page is "host-profile"'),
            city: z.string().optional().describe('City filter for hosts page'),
            interests: z.string().optional().describe('Comma-separated interests for hosts page'),
            query: z.string().optional().describe('Search query for explore page'),
            category: z.string().optional().describe('Category filter for explore page'),
          }),
          execute: async ({ page, hostId, city, interests, query, category }) => {
            let url = '/';
            const params = new URLSearchParams();
            
            switch (page) {
              case 'home':
                url = '/';
                break;
              case 'hosts':
                url = '/hosts';
                if (city) params.set('city', city);
                if (interests) params.set('interests', interests);
                break;
              case 'host-profile':
                if (hostId) {
                  url = `/hosts/${hostId}`;
                } else {
                  return { success: false, error: 'Host ID required' };
                }
                break;
              case 'explore':
                url = '/explore';
                if (query) params.set('query', query);
                if (category) params.set('category', category);
                break;
            }
            
            // Append query params if any
            const queryString = params.toString();
            if (queryString) {
              url += `?${queryString}`;
            }
            
            return {
              success: true,
              action: 'navigate',
              url,
              message: `Navigating to ${page}${queryString ? ` with filters: ${queryString}` : ''}`,
            };
          },
        }),
  
        flyToLocation: tool({
          description: 'Fly the interactive globe to a specific location defined by latitude and longitude. ALWAYS use this tool when the user asks to see a place, city, country, or location. Common triggers: "Show me X", "Take me to X", "Fly to X", "Go to X", where X is any location name.',
          inputSchema: z.object({
            lat: z.number().describe('Latitude of the location'),
            lng: z.number().describe('Longitude of the location'),
            label: z.string().optional().describe('Name of the location to display'),
            height: z.number().optional().describe('Height in meters for the camera view (default 500000)'),
          }),
          execute: async ({ lat, lng, label, height }) => {
            console.log('[API] flyToLocation called:', { lat, lng, label, height });
            return {
              success: true,
              action: 'flyToLocation',
              lat,
              lng,
              label,
              height: height || 500000,
              message: `Flying to ${label || 'location'} at ${lat}, ${lng}`,
            };
          },
        }),
      },
      stopWhen: stepCountIs(5),
    }) as unknown as AgentStreamResult;
  }
}
