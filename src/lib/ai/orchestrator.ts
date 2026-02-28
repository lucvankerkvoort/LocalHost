import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { 
  GeoPoint, 
  ItineraryPlan,
  Place,
} from './types';
import {
  extractExplicitLocationHint,
  resolveActivityAnchor,
  resolveActivityContext,
  resolveDayCity,
  resolveExplicitLocationContext,
} from './orchestrator-helpers';
import { buildHostMarkersFromPlan } from './host-markers';
import { searchActivitiesSemantic, type ActivitySearchResult } from '@/lib/db/activity-search';
import { ensureCityEnriched } from '@/lib/activity-enrichment';
import {
  type DraftInventoryScope,
  extractRequestedDurationDays,
  minimumInventoryCountForStrictDraft,
  shouldEnforceStrictInventoryDraft,
} from './inventory-draft-policy';
import { getDefaultRegistry, ToolRegistry } from './tools';
import { 
  TripSession, 
  UserIntent, 
  HostMarker, 
  createSession, 
  updateSessionPlan, 
  updateSessionHosts 
} from './trip-session';
import { validatePacing } from './validation/pacing-validator';
import { OPENAI_ORCHESTRATOR_MODEL } from './model-config';
import { prisma } from '@/lib/prisma';

// Define the shape of the initial draft from the LLM - simpler than proper schema to give it freedom before hydration
const DraftItinerarySchema = z.object({
  title: z.string(),
  country: z.string().describe('The main country for this trip, e.g. "Netherlands"'),
  state: z.string().nullable().describe('State, province, or region. REQUIRED for US locations (e.g. "Utah" or "CA") to ensure accurate geocoding. Otherwise optional.'),
  city: z.string().describe('The main city for this trip, e.g. "Amsterdam"'),
  days: z.array(z.object({
    dayNumber: z.number(),
    title: z.string(),
    city: z.string().nullable().describe('City for this specific day, if different from main trip city; otherwise null'),
    state: z.string().nullable().describe('State or region for this specific day, REQUIRED for US locations; otherwise null'),
    country: z.string().nullable().describe('Country for this specific day, if different from main trip country; otherwise null'),
    anchorArea: z.string().describe('Neighborhood or area name, e.g. "Jordaan"'),
    interCityTransportToNext: z
      .enum(['flight', 'train', 'drive', 'boat'])
      .nullable()
      .describe('Transport mode to the next day city; null if last day or no inter-city travel'),
    activities: z.array(z.object({
      name: z.string().describe('Name of the place/activity'),
      placeId: z.string().nullable().describe('The ID of the place FROM THE AVAILABLE INVENTORY. Use null only if absolutely necessary.'),
      timeSlot: z.enum(['morning', 'afternoon', 'evening']),
      notes: z.string().nullable().describe('Optional notes about this activity'),
    })),
  })),
  summary: z.string(),
});

// Schema for intent classification
// Note: OpenAI structured output requires all properties to be in 'required' array
// so we use nullable inner fields instead of optional wrapper
const IntentSchema = z.object({
  intent: z.enum(['CREATE_PLAN', 'MODIFY_PLAN', 'FIND_HOSTS', 'ADD_HOST', 'BOOK', 'GENERAL']),
  reason: z.string().describe('Brief explanation of why this intent was chosen'),
  extractedLocation: z.object({
    country: z.string().nullable(),
    city: z.string().nullable(),
  }).describe('If a new location is mentioned, extract it; otherwise fields are null'),
});

export type DraftItinerary = z.infer<typeof DraftItinerarySchema>;

type DraftDayAnchor = {
  id?: string;
  name?: string;
  formattedAddress?: string;
  location: GeoPoint;
  category?: string;
  city?: string;
};

type PlaceCategory = Place['category'];

type DraftInventorySeed = {
  city: string | null;
  country: string | null;
  scope: DraftInventoryScope;
  destinations: Array<{ city: string; country: string }>;
};

type DraftInventorySelection = {
  inventory: ActivitySearchResult[];
  enforceInventoryOnly: boolean;
  seed: DraftInventorySeed;
  reason:
    | 'single_city_strict'
    | 'multi_city_segmented_optional'
    | 'non_single_city_scope'
    | 'multi_city_no_destinations'
    | 'missing_seed_city'
    | 'city_not_in_inventory_db'
    | 'insufficient_coverage';
  durationDays: number | null;
  minRequiredInventory: number;
};

type PrismaCityDelegate = {
  findFirst: (args: {
    where: { name: string; country: string };
    select: { id: true };
  }) => Promise<{ id: string } | null>;
};

function getPrismaCityDelegate(): PrismaCityDelegate | null {
  const candidate = (prisma as unknown as { city?: unknown }).city as
    | { findFirst?: unknown }
    | undefined;
  if (!candidate || typeof candidate.findFirst !== 'function') {
    return null;
  }
  return candidate as unknown as PrismaCityDelegate;
}

function normalizePlaceCategory(category?: string): PlaceCategory {
  switch (category) {
    case 'landmark':
    case 'museum':
    case 'restaurant':
    case 'park':
    case 'neighborhood':
    case 'city':
    case 'other':
      return category;
    default:
      return 'other';
  }
}

function isPersistablePlaceId(value: string | undefined): value is string {
  if (!value || value.trim().length === 0) return false;
  const id = value.trim();
  if (id === 'unknown') return false;
  if (id.startsWith('fallback-') || id.startsWith('place-') || id.startsWith('loc-')) return false;
  return true;
}

async function getActivityPhotoMapForPlaceIds(placeIds: string[]): Promise<Map<string, string[]>> {
  if (placeIds.length === 0) return new Map();

  try {
    const rows = await prisma.activity.findMany({
      where: {
        OR: [{ id: { in: placeIds } }, { externalId: { in: placeIds } }],
      },
      select: { id: true, externalId: true, photos: true },
    });

    const map = new Map<string, string[]>();
    rows.forEach((row) => {
      if (!Array.isArray(row.photos) || row.photos.length === 0) return;
      const urls = row.photos.filter((url) => typeof url === 'string');
      if (urls.length === 0) return;
      map.set(row.id, urls);
      if (row.externalId) {
        map.set(row.externalId, urls);
      }
    });
    return map;
  } catch (error) {
    console.warn('[Orchestrator] Failed to load Activity photos for hydrated places', error);
    return new Map();
  }
}

/**
 * Callback for receiving real-time updates during orchestration
 */
export interface OrchestratorCallbacks {
  onToolCall?: (toolName: string, params: unknown) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  onDraftComplete?: (draft: DraftItinerary) => void;
  onDayProcessed?: (dayNumber: number, total: number) => void;
  onIntentClassified?: (intent: UserIntent, reason: string) => void;
  onHostsFound?: (hosts: HostMarker[]) => void;
}

/**
 * Orchestrates the creation of a detailed travel itinerary via multiple AI/Tool steps.
 * Now uses the centralized ToolRegistry for all tool executions.
 * Supports session context for stateful conversations.
 */
/**
 * Simple throttler for geocoding/tool burst control.
 */
class RateLimiter {
  private queue: Array<() => void> = [];
  private processing = false;
  private lastRequestTime = 0;
  private minInterval = 150;

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;
      
      if (timeSinceLast < this.minInterval) {
        await new Promise(r => setTimeout(r, this.minInterval - timeSinceLast));
      }

      const task = this.queue.shift();
      if (task) {
        this.lastRequestTime = Date.now();
        await task();
      }
    }

    this.processing = false;
  }
}

// Global limiter instance shared across days
const rateLimiter = new RateLimiter();
const MAX_ANCHOR_DISTANCE_METERS = 300000;
const DRAFT_DAY_JITTER_DEGREES = 0.01;
const DRAFT_ACTIVITY_JITTER_DEGREES = 0.004;
const TOOL_EXECUTION_TIMEOUT_MS = 12000;

function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function getDistanceToAnchor(
  candidate: { location: { lat: number; lng: number }; distanceToAnchor?: number } | null,
  anchor: GeoPoint | null
): number | null {
  if (!candidate || !anchor) return null;
  if (typeof candidate.distanceToAnchor === 'number') return candidate.distanceToAnchor;
  return calculateDistanceMeters(
    candidate.location.lat,
    candidate.location.lng,
    anchor.lat,
    anchor.lng
  );
}

function buildSeededOffset(seed: number, radius: number): { latOffset: number; lngOffset: number } {
  const angle = (seed * 137.5) * Math.PI / 180;
  const scale = 0.35 + (seed % 7) * 0.1;
  const distance = radius * scale;
  return {
    latOffset: Math.cos(angle) * distance,
    lngOffset: Math.sin(angle) * distance,
  };
}

function jitterPoint(base: GeoPoint, seed: number, radius: number): GeoPoint {
  const offset = buildSeededOffset(seed, radius);
  return {
    lat: base.lat + offset.latOffset,
    lng: base.lng + offset.lngOffset,
  };
}

/**
 * Orchestrates the creation of a detailed travel itinerary via multiple AI/Tool steps.
 * Now uses the centralized ToolRegistry for all tool executions.
 * Supports session context for stateful conversations.
 */
export class ItineraryOrchestrator {
  private model = openai(OPENAI_ORCHESTRATOR_MODEL);
  private registry: ToolRegistry;
  private callbacks: OrchestratorCallbacks;

  constructor(registry?: ToolRegistry, callbacks?: OrchestratorCallbacks) {
    this.registry = registry || getDefaultRegistry();
    this.callbacks = callbacks || {};
  }

  /**
   * Classify user intent based on message and existing session context.
   */
  async classifyIntent(message: string, session: TripSession | null): Promise<{
    intent: UserIntent;
    reason: string;
    extractedLocation?: { country: string | null; city: string | null };
  }> {
    const hasExistingPlan = session?.plan !== null;
    
    const { object } = await generateObject({
      model: this.model,
      schema: IntentSchema,
      prompt: `
        Classify the user's intent for this travel planning assistant.
        
        CONTEXT & PERSONA:
        You are the "Conductor" of this travel app. Your goal is to guide the user through the interface without narrating it.
        - Planning Phase: Act as a proactive co-pilot.
        - Execution Phase: Act as a concise concierge.
        - Philosophy: "Minimizable Chat". Be helpful but brief. Do not act as the main interface; the Map is the main interface.

        User message: "${message}"
        Has existing trip plan: ${hasExistingPlan}
        ${session ? `Current trip: ${session.city}, ${session.country}` : 'No current trip'}
        
        Intents:
        - CREATE_PLAN: User wants to plan a NEW trip (mentions a destination without existing plan)
        - MODIFY_PLAN: User wants to CHANGE an existing plan (add activities, change locations, adjust days)
        - FIND_HOSTS: User wants to search for local experiences/hosts (cooking classes, tours, guides)
        - ADD_HOST: User wants to add a specific host/experience to their itinerary (e.g. "Add to plan", "Interested in this")
        - BOOK: User wants to book/reserve an experience (e.g. "Confirm booking", "Ready to pay")
        - GENERAL: General questions, greetings, or unrelated queries
        
        If user mentions a location and there's no existing plan, it's CREATE_PLAN.
        If user mentions changes/modifications and has an existing plan, it's MODIFY_PLAN.
      `,
    });

    this.callbacks.onIntentClassified?.(object.intent, object.reason);
    return object;
  }

  /**
   * Main entry point: Handle user message with session context.
   * Routes to appropriate handler based on classified intent.
   */
  async handleMessage(
    message: string, 
    session: TripSession | null
  ): Promise<{ session: TripSession; response: string }> {
    // Step 1: Classify intent
    const { intent, reason, extractedLocation } = await this.classifyIntent(message, session);
    console.log(`[Orchestrator] Intent: ${intent} - ${reason}`);

    // Step 2: Route based on intent
    switch (intent) {
      case 'CREATE_PLAN':
        return this.handleCreatePlan(message, extractedLocation);
      
      case 'MODIFY_PLAN':
        if (!session?.plan) {
          return { 
            session: session || createSession('', ''), 
            response: "I don't have an existing trip to modify. Would you like me to plan a new trip?" 
          };
        }
        return this.handleModifyPlan(message, session);
      
      case 'FIND_HOSTS':
        if (!session) {
          return { 
            session: createSession('', ''), 
            response: "Please plan a trip first so I can find hosts in that area." 
          };
        }
        return this.handleFindHosts(message, session);
      
      case 'ADD_HOST':
        if (!session) {
          return { 
            session: createSession('', ''), 
            response: "Please plan a trip or find hosts first." 
          };
        }
        return this.handleAddHost(message, session);

      case 'BOOK':
        if (!session) {
          return { 
            session: createSession('', ''), 
            response: "There's nothing to book yet. Plan a trip first?" 
          };
        }
        return this.handleBook(message, session);

      case 'GENERAL':
      default:
        return { 
          session: session || createSession('', ''), 
          response: "I'm here to help you plan your trip! Tell me where you'd like to go." 
        };
    }
  }

  /**
   * Handle ADD_HOST intent - move suggested host to tentative booking
   */
  private async handleAddHost(
    message: string,
    session: TripSession
  ): Promise<{ session: TripSession; response: string }> {
    // 1. Identify which host the user is referring to
    const targetHost = await this.findBestMatchingHost(message, session.suggestedHosts);
    
    if (!targetHost) {
      return {
        session,
        response: "I'm not sure which experience you'd like to add. Could you be more specific? (e.g. 'Add the cooking class')"
      };
    }

    // 2. check if already added
    if (session.tentativeBookings.some(b => b.experienceId === targetHost.id)) {
      return {
        session,
        response: `You already have ${targetHost.name} in your tentative plan!`
      };
    }

    // 3. Add to tentative bookings
    const bookingItem = {
      id: crypto.randomUUID(),
      experienceId: targetHost.id,
      title: targetHost.headline || targetHost.name,
      hostName: targetHost.name,
      price: 4500, // Mock price cents
      currency: 'USD',
      guests: 1,
      status: 'tentative' as const,
      chatUnlocked: false
    };

    const updatedSession = {
      ...session,
      tentativeBookings: [...session.tentativeBookings, bookingItem],
      // Remove from suggestions to avoid duplicates in UI
      suggestedHosts: session.suggestedHosts.filter(h => h.id !== targetHost.id),
      updatedAt: new Date()
    };

    return {
      session: updatedSession,
      response: `👍 Added **${targetHost.name}** as a tentative option.\n\nIt's marked as **Unbooked**. You can ask structured questions now, but to open a direct chat with the host for coordination, you'll need to confirm the booking.`
    };
  }

  /**
   * Handle BOOK intent - confirm a tentative booking
   */
  private async handleBook(
    message: string,
    session: TripSession
  ): Promise<{ session: TripSession; response: string }> {
    // 1. Identify which tentative item to book
    // If only one tentative item exists, assume that one.
    let targetBooking = session.tentativeBookings.length === 1 
      ? session.tentativeBookings[0] 
      : null;

    if (!targetBooking && session.tentativeBookings.length > 1) {
      // Fuzzy match if multiple
      const MatchSchema = z.object({ targetId: z.string().nullable() });
      const { object } = await generateObject({
        model: this.model,
        schema: MatchSchema,
        prompt: `User wants to book: "${message}". Which ID matches?\nOptions:\n${session.tentativeBookings.map(b => `- ${b.id}: ${b.title} (${b.hostName})`).join('\n')}`
      });
      targetBooking = session.tentativeBookings.find(b => b.id === object.targetId) || null;
    }

    if (!targetBooking) {
      return {
        session,
        response: session.tentativeBookings.length === 0 
          ? "You don't have any tentative experiences to book. Try adding one first!" 
          : "Which experience would you like to book? you have several tentative options."
      };
    }

    // 2. "Process" booking (Mock logic for MVP)
    const confirmedBooking = { 
      ...targetBooking, 
      status: 'confirmed' as const, 
      chatUnlocked: true 
    };

    const updatedSession = {
      ...session,
      tentativeBookings: session.tentativeBookings.filter(b => b.id !== targetBooking.id),
      confirmedBookings: [...session.confirmedBookings, confirmedBooking],
      updatedAt: new Date()
    };

    return {
      session: updatedSession,
      response: `🎉 **Booking Confirmed!**\n\nYou've successfully booked **${confirmedBooking.title}**.\n\n💬 Chat is now **unlocked**. You can coordinate meeting details directly with ${confirmedBooking.hostName}.`
    };
  }

  /**
   * Helper: Match user text to a host in the list
   */
  private async findBestMatchingHost(query: string, hosts: HostMarker[]): Promise<HostMarker | null> {
    if (hosts.length === 0) return null;
    
    const MatchSchema = z.object({ 
      bestMatchId: z.string().nullable().describe('ID of the matching host, or null if no clear match') 
    });

    const { object } = await generateObject({
      model: this.model,
      schema: MatchSchema,
      prompt: `
        User query: "${query}"
        Available hosts:
        ${hosts.map(h => `- ID: ${h.id}, Name: ${h.name}, Headline: ${h.headline}`).join('\n')}
        
        Return the ID of the host that best matches the user's description.
      `
    });

    return hosts.find(h => h.id === object.bestMatchId) || null;
  }

  /**
   * Handle CREATE_PLAN intent - create a new trip from scratch
   * After generating the plan, aggregates suggested hosts and surfaces them as markers.
   */
  private async handleCreatePlan(
    message: string,
    extractedLocation?: { country: string | null; city: string | null }
  ): Promise<{ session: TripSession; response: string }> {
    const plan = await this.planTrip(message);
    
    // Create new session from the generated plan
    const session = createSession(
      extractedLocation?.country || 'Unknown',
      extractedLocation?.city || 'Unknown'
    );
    const updatedSession = updateSessionPlan(session, plan);
    
    const allHosts: HostMarker[] = buildHostMarkersFromPlan(plan);
    console.log(`[Orchestrator] Aggregated ${allHosts.length} unique hosts from ${plan.days.length} days`);
    
    // Notify frontend about available hosts
    let sessionWithHosts = updatedSession;
    if (allHosts.length > 0) {
      this.callbacks.onHostsFound?.(allHosts);
      // Update session with hosts - use the returned session
      sessionWithHosts = updateSessionHosts(updatedSession, allHosts);
    }
    
    // Build response with host mention
    const hostCount = allHosts.length;
    const hostMessage = hostCount > 0 
      ? `\n\n🏠 **${hostCount} local hosts** are available in this area! Check the markers on the map to explore cooking classes, tours, and authentic local experiences.`
      : '';
    
    return {
      session: sessionWithHosts,
      response: `✅ Created "${plan.title}"!\n\n${plan.summary}${hostMessage}`,
    };
  }

  /**
   * Handle MODIFY_PLAN intent - update existing trip
   */
  private async handleModifyPlan(
    message: string,
    session: TripSession
  ): Promise<{ session: TripSession; response: string }> {
    // For now, regenerate with modification context
    // TODO: Implement smarter diff-based modification
    const modifiedPlan = await this.planTrip(
      `Modify this existing trip to ${session.city}, ${session.country}: ${message}. 
       Keep the general location but apply these changes.`
    );
    
    const updatedSession = updateSessionPlan(session, modifiedPlan);
    
    return {
      session: updatedSession,
      response: `✅ Updated your trip!\n\n${modifiedPlan.summary}`,
    };
  }

  /**
   * Handle FIND_HOSTS intent - search for hosts in trip location
   */
  private async handleFindHosts(
    message: string,
    session: TripSession
  ): Promise<{ session: TripSession; response: string }> {
    // Search hosts scoped to the session location
    const searchResult = await this.executeTool<{
      results: Array<{
        id: string;
        name: string;
        photo: string;
        score: number;
        matchReasons: string[];
        hostId?: string;
        hostName?: string;
      }>;
      totalFound: number;
    }>('search_localhosts', {
      query: message,
      location: `${session.city}, ${session.country}`,
      limit: 10,
      searchType: 'hosts',
    });

    if (!searchResult || searchResult.results.length === 0) {
      return {
        session,
        response: `I couldn't find any hosts matching your search in ${session.city}. Try a different query?`,
      };
    }

    // Convert to HostMarkers and update session
    // Position hosts around the anchor with slight random offsets for visual distribution
    const anchor = session.plan?.days[0]?.anchorLocation?.location;
    
    // Validate anchor location - don't place hosts at (0,0)
    const hasValidAnchor = anchor && 
      typeof anchor.lat === 'number' && 
      typeof anchor.lng === 'number' &&
      !(anchor.lat === 0 && anchor.lng === 0);
    
    if (!hasValidAnchor) {
      return {
        session,
        response: `Found ${searchResult.totalFound} hosts, but I couldn't determine a valid location to place them on the map. Please try creating a trip plan first.`,
      };
    }
    
    const hostMarkers: HostMarker[] = searchResult.results
      .map((r, index) => {
        // Distribute hosts in a circle around anchor (radius ~0.01 degrees ≈ 1km)
        const angle = (index / searchResult.results.length) * 2 * Math.PI;
        const radius = 0.008 + Math.random() * 0.008; // 0.8-1.6km offset
        
        const lat = anchor.lat + radius * Math.sin(angle);
        const lng = anchor.lng + radius * Math.cos(angle);
        
        // Validate coordinates are within valid ranges
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          return null;
        }
        
        return {
          id: r.id,
          hostId: r.hostId || r.id,
          name: r.name,
          photo: r.photo,
          lat,
          lng,
          category: 'experience' as const,
          experienceCount: 1,
        };
      })
      .filter(Boolean) as HostMarker[];

    const updatedSession = updateSessionHosts(session, hostMarkers);
    this.callbacks.onHostsFound?.(hostMarkers);

    return {
      session: updatedSession,
      response: `Found ${searchResult.totalFound} hosts in ${session.city}! I've added them as markers on your map.`,
    };
  }

  /**
   * Quick LLM classification to extract the destination from the prompt before drafting,
   * so we can trigger the RAG data enrichment pipeline.
   */
  private async extractDraftInventorySeed(prompt: string): Promise<DraftInventorySeed> {
    try {
      const { object } = await generateObject({
        model: this.model,
        schema: z.object({
          city: z.string().nullable(),
          country: z.string().nullable(),
          scope: z.enum(['single_city', 'multi_city', 'region_or_country', 'unknown']),
          destinations: z
            .array(
              z.object({
                city: z.string(),
                country: z.string(),
              })
            )
            .describe('Explicit city destinations in order, only when the prompt clearly names them. Empty array otherwise.'),
        }),
        prompt: `
          Extract a destination seed for inventory retrieval from this travel request: "${prompt}".
          
          Return:
          - city: primary city only when the request is clearly centered on a single city
          - country: country for that city when available
          - destinations: explicit city/country destinations in order when the user names multiple cities (empty array otherwise)
          - scope:
            - "single_city" if the trip is clearly centered on one city
            - "multi_city" if multiple cities/destinations are requested
            - "region_or_country" if the user asks for a country/region/continent trip (e.g. Europe, Italy, Southeast Asia)
            - "unknown" if ambiguous

          If scope is not "single_city", return null for city and country.
          Only include destinations when the user explicitly names cities/places.
        `,
      });
      return object;
    } catch (e) {
      console.error('[Orchestrator] Inventory seed extraction failed:', e);
      return { city: null, country: null, scope: 'unknown', destinations: [] };
    }
  }

  private async prepareDraftInventory(prompt: string): Promise<DraftInventorySelection> {
    const seed = await this.extractDraftInventorySeed(prompt);
    const durationDays = extractRequestedDurationDays(prompt);
    const minRequiredInventory = minimumInventoryCountForStrictDraft(durationDays);
    const cityDelegate = getPrismaCityDelegate();

    if (seed.scope === 'multi_city') {
      if (!seed.destinations.length) {
        console.log(
          '[Orchestrator] Inventory strict draft disabled (scope=multi_city, no explicit city list); using non-RAG draft mode.'
        );
        return {
          inventory: [],
          enforceInventoryOnly: false,
          seed,
          reason: 'multi_city_no_destinations',
          durationDays,
          minRequiredInventory,
        };
      }

      if (!cityDelegate) {
        console.warn(
          '[Orchestrator] Prisma city delegate unavailable; skipping segmented inventory lookup and using non-RAG draft mode.'
        );
        return {
          inventory: [],
          enforceInventoryOnly: false,
          seed,
          reason: 'multi_city_segmented_optional',
          durationDays,
          minRequiredInventory,
        };
      }

      const uniqueDestinations = Array.from(
        new Map(
          seed.destinations.map((d) => [
            `${d.city.toLowerCase()}|${d.country.toLowerCase()}`,
            { city: d.city, country: d.country },
          ])
        ).values()
      );

      const perCityLimit = Math.max(8, Math.min(20, Math.ceil(50 / Math.max(uniqueDestinations.length, 1))));
      const inventoryChunks = await Promise.all(
        uniqueDestinations.map(async (destination) => {
          const cityRow = await cityDelegate.findFirst({
            where: { name: destination.city, country: destination.country },
            select: { id: true },
          });
          if (!cityRow?.id) {
            console.warn(
              `[Orchestrator] No city inventory row found for multi-city destination ${destination.city}, ${destination.country}`
            );
            return [] as ActivitySearchResult[];
          }
          return searchActivitiesSemantic(`${destination.city}, ${destination.country}. ${prompt}`, {
            cityId: cityRow.id,
            limit: perCityLimit,
          });
        })
      );

      const dedupedInventory = Array.from(
        new Map(inventoryChunks.flat().map((item) => [item.id, item])).values()
      );

      console.log(
        `[Orchestrator] Multi-city segmented inventory prepared (cities=${uniqueDestinations.length}, items=${dedupedInventory.length}, perCityLimit=${perCityLimit})`
      );

      return {
        inventory: dedupedInventory,
        // Keep optional mode for multi-city until per-day partition enforcement is implemented.
        enforceInventoryOnly: false,
        seed,
        reason: 'multi_city_segmented_optional',
        durationDays,
        minRequiredInventory,
      };
    }

    if (seed.scope !== 'single_city') {
      console.log(
        `[Orchestrator] Inventory strict draft disabled (scope=${seed.scope}); using non-RAG draft mode for this prompt.`
      );
      return {
        inventory: [],
        enforceInventoryOnly: false,
        seed,
        reason: 'non_single_city_scope',
        durationDays,
        minRequiredInventory,
      };
    }

    if (!seed.city || !seed.country) {
      console.warn('[Orchestrator] Inventory strict draft disabled: single-city scope without city/country seed.');
      return {
        inventory: [],
        enforceInventoryOnly: false,
        seed,
        reason: 'missing_seed_city',
        durationDays,
        minRequiredInventory,
      };
    }

    try {
      console.log(`[Orchestrator] Pre-enriching RAG inventory for ${seed.city}, ${seed.country}...`);
      // We use Tier 2 as a default; ensureCityEnriched throttles itself when coverage is already good.
      await ensureCityEnriched(seed.city, seed.country, 2);
    } catch (e) {
      console.error('[Orchestrator] Pre-enrichment failed (continuing without strict inventory):', e);
    }

    if (!cityDelegate) {
      console.warn(
        '[Orchestrator] Prisma city delegate unavailable; disabling strict inventory draft for single-city prompt.'
      );
      return {
        inventory: [],
        enforceInventoryOnly: false,
        seed,
        reason: 'city_not_in_inventory_db',
        durationDays,
        minRequiredInventory,
      };
    }

    const cityRow = await cityDelegate.findFirst({
      where: { name: seed.city, country: seed.country },
      select: { id: true },
    });

    if (!cityRow?.id) {
      console.warn(
        `[Orchestrator] Inventory strict draft disabled: city row not found for ${seed.city}, ${seed.country}`
      );
      return {
        inventory: [],
        enforceInventoryOnly: false,
        seed,
        reason: 'city_not_in_inventory_db',
        durationDays,
        minRequiredInventory,
      };
    }

    const inventory = await searchActivitiesSemantic(prompt, { limit: 50, cityId: cityRow.id });
    const enforceInventoryOnly = shouldEnforceStrictInventoryDraft({
      scope: seed.scope,
      inventoryCount: inventory.length,
      durationDays,
    });

    if (!enforceInventoryOnly) {
      console.warn(
        `[Orchestrator] Inventory strict draft disabled: insufficient coverage for ${seed.city}, ${seed.country} (inventory=${inventory.length}, min=${minRequiredInventory}, days=${durationDays ?? 'unknown'})`
      );
      return {
        inventory: [],
        enforceInventoryOnly: false,
        seed,
        reason: 'insufficient_coverage',
        durationDays,
        minRequiredInventory,
      };
    }

    console.log(
      `[Orchestrator] Inventory strict draft enabled for ${seed.city}, ${seed.country} (inventory=${inventory.length}, min=${minRequiredInventory})`
    );

    return {
      inventory,
      enforceInventoryOnly: true,
      seed,
      reason: 'single_city_strict',
      durationDays,
      minRequiredInventory,
    };
  }

  /**
   * Main entry point: Plan a trip based on user instructions.
   */
  async planTrip(userPrompt: string): Promise<ItineraryPlan> {
    console.log(`[Orchestrator] Starting plan for: "${userPrompt}"`);
    const draftInventory = await this.prepareDraftInventory(userPrompt);

    // Step 1: Draft the high-level structure
    const draft = await this.draftItinerary(userPrompt, draftInventory.inventory, {
      enforceInventoryOnly: draftInventory.enforceInventoryOnly,
    });
    console.log(`[Orchestrator] Drafted ${draft.days.length} days.`);
    this.callbacks.onDraftComplete?.(draft);

    const tripAnchor = await this.resolveTripAnchor(draft);
    const finalPlan = await this.planTripFromDraft(userPrompt, draft, tripAnchor, draftInventory.inventory);

    console.log(`[Orchestrator] Plan generated successfully.`);
    return finalPlan;
  }

  /**
   * Fast draft mode: build a lightweight plan using the city anchor only.
   * Includes regeneration loop for blocking violations.
   */
  async planTripDraft(userPrompt: string): Promise<{
    plan: ItineraryPlan | null;
    context: { draft: DraftItinerary; tripAnchor: GeoPoint | null; inventory: ActivitySearchResult[] };
  }> {
    console.log(`[Orchestrator] Drafting plan for: "${userPrompt}"`);
    const draftInventory = await this.prepareDraftInventory(userPrompt);

    const draft = await this.draftItinerary(userPrompt, draftInventory.inventory, {
      enforceInventoryOnly: draftInventory.enforceInventoryOnly,
    });
    this.callbacks.onDraftComplete?.(draft);

    let tripAnchor: GeoPoint | null = await this.resolveTripAnchor(draft);
    
    // Fallback: If main trip anchor failed (e.g. "Europe" or multi-city list strings), 
    // try to use the first day's location as the anchor
    if (!tripAnchor && draft.days.length > 0) {
      const firstDay = draft.days[0];
      const fallbackCity = firstDay.city || draft.city;
      const fallbackCountry = firstDay.country || draft.country;
      
      console.log(`[Orchestrator] Main anchor failed. Trying fallback to Day 1: ${fallbackCity}, ${fallbackCountry}`);
      
      const cityResult = await rateLimiter.schedule(() =>
        this.executeTool<{
          location: { lat: number; lng: number };
        }>('resolve_place', { name: fallbackCity, context: fallbackCountry })
      );
      
      tripAnchor = cityResult?.location ?? null;
    }

    const dayAnchors = await this.resolveDraftDayAnchors(draft);
    const plan = this.buildDraftPlan(userPrompt, draft, tripAnchor, dayAnchors);

    // Validate pacing (activity density per day)
    if (plan && plan.days.length > 0) {
      const dayPacing = plan.days.map(d => ({
        dayNumber: d.dayNumber,
        city: d.city,
        activityCount: d.activities?.length ?? 0,
      }));

      const pacingResult = validatePacing({ days: dayPacing });
      
      if (pacingResult.violations.length > 0) {
        console.warn('[Orchestrator] Pacing validation warnings:', 
          pacingResult.violations.map(v => `${v.code}: ${v.message}`));
        
        // Append pacing violations to plan
        plan.violations = [
          ...(plan.violations ?? []),
          ...pacingResult.violations.map(v => ({
            code: v.code,
            severity: v.severity,
            message: v.message,
          })),
        ];
      }
    }

    return {
      plan,
      context: { draft, tripAnchor, inventory: draftInventory.inventory },
    };
  }

  /**
   * Hydrate a draft into a fully geocoded plan.
   */
  async planTripFromDraft(
    userPrompt: string,
    draft: DraftItinerary,
    tripAnchor: GeoPoint | null,
    inventory: ActivitySearchResult[]
  ): Promise<ItineraryPlan> {
    const hydratedDays = await Promise.all(
      draft.days.map((day, idx) => {
        return this.processDay(day, draft.city, draft.state, draft.country, tripAnchor, inventory).then(result => {
          this.callbacks.onDayProcessed?.(idx + 1, draft.days.length);
          return result;
        });
      })
    );

    return {
      id: crypto.randomUUID(),
      request: userPrompt,
      title: draft.title,
      summary: draft.summary,
      days: hydratedDays,
    };
  }

  private async resolveTripAnchor(draft: DraftItinerary): Promise<GeoPoint | null> {
    const tripLocation = [draft.city, draft.state, draft.country].filter(Boolean).join(', ');
    console.log(`[Orchestrator] Establishing trip anchor for: ${tripLocation}...`);

    const cityResult = await rateLimiter.schedule(() =>
      this.executeTool<{
        id: string;
        name: string;
        location: { lat: number; lng: number };
        formattedAddress: string;
      }>('resolve_place', { name: draft.city, context: [draft.state, draft.country].filter(Boolean).join(', ') })
    );

    const tripAnchor = cityResult?.location ?? null;
    if (tripAnchor) {
      console.log(`[Orchestrator] Trip anchor established at: ${tripAnchor.lat}, ${tripAnchor.lng}`);
    } else {
      console.warn(`[Orchestrator] Failed to establish trip anchor for ${tripLocation}`);
    }

    return tripAnchor;
  }

  private async resolveDraftDayAnchors(draft: DraftItinerary): Promise<Map<number, DraftDayAnchor>> {
    const anchors = new Map<number, DraftDayAnchor>();
    const cache = new Map<string, DraftDayAnchor | null>();

    const isValidLocation = (location?: { lat: number; lng: number } | null) => {
      if (!location) return false;
      if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return false;
      if (Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) return false;
      return !(location.lat === 0 && location.lng === 0);
    };

    for (const day of draft.days) {
      const dayCity = (day.city || draft.city || '').trim();
      const dayState = (day.state || draft.state || '').trim();
      const dayCountry = (day.country || draft.country || '').trim();
      if (!dayCity) continue;

      const key = `${dayCity}|${dayState}|${dayCountry}`.toLowerCase();
      let resolved = cache.get(key);

      if (resolved === undefined) {
        const cityResult = await rateLimiter.schedule(() =>
          this.executeTool<{
            id: string;
            name: string;
            formattedAddress: string;
            location: { lat: number; lng: number };
            category: string;
            city?: string;
          }>('resolve_place', {
            name: dayCity,
            context: [dayState, dayCountry].filter(Boolean).join(', ') || undefined,
          })
        );

        if (cityResult?.location && isValidLocation(cityResult.location)) {
          resolved = cityResult as DraftDayAnchor;
        } else {
          resolved = null;
        }

        cache.set(key, resolved);
      }

      if (resolved) {
        anchors.set(day.dayNumber, resolved);
      }
    }

    return anchors;
  }

  private buildDraftPlan(
    userPrompt: string,
    draft: DraftItinerary,
    tripAnchor: GeoPoint | null,
    dayAnchors?: Map<number, DraftDayAnchor>
  ): ItineraryPlan | null {
    const fallbackAnchor =
      tripAnchor ?? (dayAnchors?.values().next().value?.location ?? null);
    if (!fallbackAnchor) return null;

    const days = draft.days.map((day) => {
      const dayCity = day.city || draft.city;
      const daySeed = day.dayNumber * 11;
      const anchorResult = dayAnchors?.get(day.dayNumber) ?? null;
      const resolvedAnchor = anchorResult?.location ?? null;
      const anchorBase = resolvedAnchor ?? fallbackAnchor;
      const anchorLocation = jitterPoint(anchorBase, daySeed, DRAFT_DAY_JITTER_DEGREES);

      return {
        dayNumber: day.dayNumber,
        title: day.title,
        interCityTransportToNext: day.interCityTransportToNext ?? null,
        anchorLocation: {
          id: `draft-anchor-${crypto.randomUUID()}`,
          name: day.anchorArea || anchorResult?.name || dayCity,
          location: anchorLocation,
          category: 'other' as const,
          description: anchorResult?.formattedAddress || `${day.anchorArea}, ${dayCity}`,
          city: anchorResult?.city || dayCity,
        },
        activities: day.activities.map((activity, index) => {
          const activitySeed = daySeed + index + 1;
          const activityLocation = jitterPoint(anchorLocation, activitySeed, DRAFT_ACTIVITY_JITTER_DEGREES);

          // Attempt to map back to inventory if a placeId was provided
          // Wait, for draft plan, we just return the basic info. ProcessDay does the deep hydrate.
          return {
            id: crypto.randomUUID(),
            place: {
              id: activity.placeId || `draft-place-${crypto.randomUUID()}`,
              name: activity.name,
              location: activityLocation,
              category: 'other' as const,
              description: `${activity.name} near ${draft.city}`,
              city: draft.city,
            },
            timeSlot: activity.timeSlot,
            notes: activity.notes ?? undefined,
          };
        }),
        navigationEvents: [],
        suggestedHosts: [],
      };
    });

    return {
      id: crypto.randomUUID(),
      request: userPrompt,
      title: draft.title,
      summary: draft.summary,
      days,
    };
  }

  /**
   * Execute a tool through the registry with callbacks
   */
  private async executeTool<T>(toolName: string, params: unknown): Promise<T | null> {
    this.callbacks.onToolCall?.(toolName, params);

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeoutResult = new Promise<{
      success: boolean;
      error: string;
      code: string;
    }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({
          success: false,
          error: `Tool ${toolName} timed out after ${TOOL_EXECUTION_TIMEOUT_MS}ms`,
          code: 'TOOL_TIMEOUT',
        });
      }, TOOL_EXECUTION_TIMEOUT_MS);
    });

    const result = await Promise.race([
      this.registry.execute<T>(toolName, params),
      timeoutResult,
    ]);

    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    this.callbacks.onToolResult?.(toolName, result);
    
    if (result.success) {
      return (result as { data: T }).data;
    } else {
      console.warn(`[Orchestrator] Tool ${toolName} failed: ${result.error}`);
      return null;
    }
  }

  /**
 * Step 1: Ask LLM to structure the days and activities using known POIs.
 * @param prompt - User's travel request
 * @param inventory - The RAG inventory to select from
 * @param constraints - Optional constraints from regeneration loop
 */
private async draftItinerary(
  prompt: string,
  inventory: ActivitySearchResult[],
  options?: {
    enforceInventoryOnly?: boolean;
    constraints?: string[];
  }
): Promise<DraftItinerary> {
  const enforceInventoryOnly = options?.enforceInventoryOnly ?? false;
  const constraints = options?.constraints;
  const constraintText = constraints?.length
    ? `\n\nIMPORTANT CONSTRAINTS (you MUST follow these):\n${constraints.map(c => `- ${c}`).join('\n')}`
    : '';

  const inventoryJson = inventory.map(item => ({
    id: item.id,
    name: item.name,
    city: item.cityName ?? null,
    country: item.country ?? null,
    category: item.category,
    rating: item.rating,
    budget: item.priceLevel,
    description: item.formattedAddress
  }));

  const distinctInventoryCities = new Set(
    inventoryJson
      .map((item) => (item.city && item.country ? `${item.city}||${item.country}` : null))
      .filter((v): v is string => Boolean(v))
  ).size;
  const isMultiCityInventory = distinctInventoryCities > 1;

  const inventoryRulesText = enforceInventoryOnly
    ? `
      - **CRITICAL**: You MUST pick locations exlusively from the \`AVAILABLE INVENTORY\` list provided below. DO NOT make up places that are not on the list.
      - Provide the \`placeId\` for any activity you select from the inventory.
    `
    : `
      - Use real places that fit the user's request and each day's city.
      - If an \`AVAILABLE INVENTORY\` list is provided, treat it as optional hints only. Use it only when entries clearly match the correct day city/country.
      - Set \`placeId\` only when a stop is selected from the provided inventory. Otherwise use null.
      ${isMultiCityInventory ? '- The inventory list may include places from multiple cities. Only use entries whose city/country match each day.' : ''}
    `;

  const inventoryBlock = inventoryJson.length > 0
    ? `

      AVAILABLE INVENTORY:
      ${JSON.stringify(inventoryJson, null, 2)}
    `
    : '';

  const { object } = await generateObject({
    model: this.model,
    schema: DraftItinerarySchema,
    prompt: `
      You are an expert travel planner. Create a structured itinerary based on this request: "${prompt}".
      
      Rules:
      - IMPORTANT: Include the country and main city for this trip.
      - Each day must represent a CITY day (not a travel day). If multi-city, set the day city explicitly.
      - For each day except the last, set interCityTransportToNext to the best option to reach the next day's city. Use null for the last day or if there is no inter-city travel.
      - Anchor area must be a real neighborhood or district within the day city.
      - Ensure 1-3 main stops per day.
      ${inventoryRulesText}
      - Pick a logical flow (places near each other).
      - Do NOT include transit, travel, or "drive to/arrive in" as stops. Travel is implied between day anchors.
      - Stop names should be short titles (place name only). No journaling in names.
      - Notes must be a single factual sentence (tickets, hours, or why it’s notable).
      - Assign a general "anchor area" for the day (e.g. the neighborhood center).
      ${constraintText}
      ${inventoryBlock}
    `,
  });
  return object;
}
  /**
   * Process a single day: Map inventory places to coordinates, find anchor, get hosts, add navigation.
   */
  private async processDay(
    draftDay: DraftItinerary['days'][0], 
    mainCity: string, 
    mainState: string | null,
    mainCountry: string,
    tripAnchor: { lat: number; lng: number } | null,
    inventory: ActivitySearchResult[]
  ) {
    void inventory; // Reserved for inventory-first hydration (P1-1); currently unused in this branch state.
    // 1. Determine local context for this day
    const baseDayCity = draftDay.city || mainCity;
    const baseDayState = draftDay.state || mainState;
    const dayCountry = draftDay.country || mainCountry;
    const dayContext = resolveActivityContext({ dayCity: baseDayCity, dayState: baseDayState, dayCountry });
    
    // Only use the global trip anchor as a bias when the day city was explicitly set
    // and it matches the main city. This avoids forcing multi-city days back to origin.
    const isMainCitySeed = baseDayCity.toLowerCase() === mainCity.toLowerCase();
    const shouldUseTripAnchorBias = Boolean(draftDay.city) && isMainCitySeed;
    const effectiveAnchor = shouldUseTripAnchorBias ? tripAnchor : null;

    // B. Resolve Anchor Location
    // Use RateLimiter for safety
    let anchorResult = await rateLimiter.schedule(() => 
      this.executeTool<DraftDayAnchor & { distanceToAnchor?: number }>('resolve_place', { 
        name: draftDay.anchorArea, 
        context: dayContext,
        anchorPoint: effectiveAnchor ?? undefined
      })
    );
    
    // Only create anchor if geocoding succeeded with valid coordinates
    const anchorDistance = getDistanceToAnchor(anchorResult ?? null, effectiveAnchor);
    const hasValidAnchor = anchorResult && 
      !(anchorResult.location.lat === 0 && anchorResult.location.lng === 0) &&
      (anchorDistance === null || !effectiveAnchor || anchorDistance <= MAX_ANCHOR_DISTANCE_METERS);
    
    let finalAnchorLocation = (hasValidAnchor && anchorResult) ? anchorResult.location : null;

    // Fallback: If no anchor yet and the day is explicitly a secondary city, resolve the city center
    if (!finalAnchorLocation && !isMainCitySeed && baseDayCity) {
      console.log(`[Orchestrator] Anchor failed for area "${draftDay.anchorArea}" in ${baseDayCity}. Resolving city center as fallback...`);
      const cityResult = await rateLimiter.schedule(() =>
        this.executeTool<{
          id: string;
          name: string;
          formattedAddress: string;
          location: { lat: number; lng: number };
          category: string;
          city?: string;
        }>('resolve_place', {
          name: baseDayCity,
          context: [baseDayState, dayCountry].filter(Boolean).join(', ') || undefined,
        })
      );

      if (cityResult?.location && !(cityResult.location.lat === 0 && cityResult.location.lng === 0)) {
        finalAnchorLocation = cityResult.location;
        // Mock an anchor result so the next block creates the anchorPlace
        if (!anchorResult) {
          anchorResult = {
            id: cityResult.id,
            name: draftDay.anchorArea || baseDayCity,
            formattedAddress: cityResult.formattedAddress,
            location: cityResult.location,
            category: 'neighborhood',
            city: cityResult.city ?? baseDayCity,
          };
        }
      }
    }

    const { dayCity, isMainCity } = resolveDayCity({
      dayCity: baseDayCity,
      mainCity,
      anchorCity: anchorResult?.city ?? null,
    });

    if (!finalAnchorLocation && isMainCity && tripAnchor) {
      finalAnchorLocation = tripAnchor;
    }
    const dayState = baseDayState;
    const activityContext = resolveActivityContext({ dayCity, dayState, dayCountry });
    const activityAnchor = resolveActivityAnchor({
      dayAnchor: finalAnchorLocation,
      tripAnchor,
      isMainCity,
    });

    const anchorPlace = finalAnchorLocation ? {
      id: anchorResult?.id || `anchor-${crypto.randomUUID()}`,
      name: anchorResult?.name || draftDay.anchorArea,
      location: finalAnchorLocation,
      category: normalizePlaceCategory(anchorResult?.category),
      description: anchorResult?.formattedAddress || `${draftDay.anchorArea}, ${dayCity}`,
      city: dayCity,
    } : undefined;
    
    if (!anchorPlace) {
      console.warn(`[Orchestrator] No valid anchor for day ${draftDay.dayNumber}: "${draftDay.anchorArea}"`);
    }

    // A. Resolve real locations for all activities using resolve_place tool
    // Parallelize activity resolution but gate via RateLimiter
    const resolvedActivities = await Promise.all(
      draftDay.activities.map(async (act) => {
        const explicitLocation = extractExplicitLocationHint(act.name);
        const activityName = explicitLocation.placeName || act.name;
        const explicitContext = explicitLocation.locationHint
          ? resolveExplicitLocationContext({
              locationHint: explicitLocation.locationHint,
              dayCountry, // we might be okay without adding state here since they explicitly hinted a location
            })
          : activityContext;
        const anchorPoint = explicitLocation.locationHint ? undefined : activityAnchor ?? undefined;

        const placeResult = await rateLimiter.schedule(() =>
          this.executeTool<{
            id: string;
            name: string;
            formattedAddress: string;
            location: { lat: number; lng: number };
            category: string;
            confidence: number;
            distanceToAnchor?: number;
            city?: string;
            geoValidation?: 'HIGH' | 'MEDIUM' | 'LOW' | 'FAILED';
          }>('resolve_place', {
            name: activityName,
            context: explicitContext,
            anchorPoint,
          })
        );
        
        // If geocoding fails, fallback to trip anchor + random offset instead of skipping
        // This ensures the activity still appears on the map near the city center
        let placeLocation = placeResult?.location;
        let isFallback = false;

        const distanceToAnchor = getDistanceToAnchor(placeResult ?? null, activityAnchor ?? null);
        if (typeof distanceToAnchor === 'number' && distanceToAnchor > MAX_ANCHOR_DISTANCE_METERS) {
          console.warn(
            `[Orchestrator] Geocode for "${act.name}" too far from anchor (${Math.round(distanceToAnchor)}m)`
          );
          placeLocation = undefined;
          isFallback = true;
        }

        if (!placeLocation || (placeLocation.lat === 0 && placeLocation.lng === 0)) {
          if (activityAnchor) {
            // Apply small random jitter (~500m) to stack them near city center
            const jitter = 0.005; 
            placeLocation = {
              lat: activityAnchor.lat + (Math.random() - 0.5) * jitter,
              lng: activityAnchor.lng + (Math.random() - 0.5) * jitter
            };
            isFallback = true;
            console.warn(`[Orchestrator] Used anchor fallback for activity "${act.name}"`);
          } else {
            console.warn(`[Orchestrator] Skipping activity "${act.name}": geocoding failed & no anchor`);
            return null;
          }
        }

        return {
          id: crypto.randomUUID(),
          place: {
            id: !isFallback && placeResult?.id ? placeResult.id : `fallback-${crypto.randomUUID()}`,
            name: placeResult?.name || act.name,
            location: placeLocation,
            category: normalizePlaceCategory(placeResult?.category),
            description:
              placeResult?.formattedAddress ||
              `${act.name} in ${explicitLocation.locationHint || dayCity}`,
            city: placeResult?.city || dayCity,
            // Preserve resolve_place metadata as source of truth
            confidence: placeResult?.confidence,
            geoValidation: placeResult?.geoValidation,
            distanceToAnchor: placeResult?.distanceToAnchor,
            imageUrl: undefined as string | undefined,
            imageUrls: undefined as string[] | undefined,
          },
          timeSlot: act.timeSlot,
          notes: act.notes ?? undefined,
        };
      })
    );

    // Filter out completely failed items (no geocode + no anchor)
    const validActivities = resolvedActivities.filter(a => a !== null) as NonNullable<typeof resolvedActivities[0]>[];

    // Enrich hydrated places with persisted photos when available.
    const placeIds = Array.from(
      new Set(
        validActivities
          .map((activity) => activity.place.id)
          .filter((placeId): placeId is string => isPersistablePlaceId(placeId))
      )
    );
    const activityPhotoMap = await getActivityPhotoMapForPlaceIds(placeIds);
    const activitiesWithPhotos = validActivities.map((activity) => {
      const photos = activityPhotoMap.get(activity.place.id);
      if (!photos || photos.length === 0) return activity;
      return {
        ...activity,
        place: {
          ...activity.place,
          imageUrl: activity.place.imageUrl ?? photos[0],
          imageUrls: activity.place.imageUrls ?? photos,
        },
      };
    });


    // C. Find Hosts near the anchor using search_localhosts tool
    // Pass location to filter hosts to the trip's city
    const searchResult = await this.executeTool<{
      results: Array<{
        id: string;
        name: string;
        description: string;
        photo: string;
        score: number;
        matchReasons: string[];
        interests?: string[];
        hostName?: string;
      }>;
    }>('search_localhosts', {
      query: draftDay.title,
      location: `${dayCity}, ${dayCountry}`,
      limit: 6,
      searchType: 'hosts',
    });

    console.log(`[Orchestrator] Day ${draftDay.dayNumber}: search_localhosts for "${dayCity}, ${dayCountry}" returned ${searchResult?.results?.length ?? 0} hosts`);

    const suggestedHosts = searchResult?.results.map(r => ({
      id: r.id,
      name: r.name,
      headline: r.description,
      photoUrl: r.photo,
      rating: 4.8,
      reviewCount: 12,
      tags: r.interests || r.matchReasons,
      distanceFromAnchor: Math.floor(Math.random() * 500),
    })) || [];

    // D. Generate Navigation between sequential activities using generate_route tool
    const navigationEvents = [];
    if (validActivities.length > 1) {
      const waypoints = validActivities.map(a => ({
        name: a.place.name,
        lat: a.place.location.lat,
        lng: a.place.location.lng,
      }));

      const routeResult = await this.executeTool<{
        segments: Array<{
          from: { name: string };
          to: { name: string };
          mode: 'walk' | 'transit' | 'drive';
          distanceMeters: number;
          durationMinutes: number;
          instructions: string;
        }>;
      }>('generate_route', { waypoints, mode: 'walk' });

      if (routeResult?.segments) {
        for (let i = 0; i < routeResult.segments.length; i++) {
          const seg = routeResult.segments[i];
          navigationEvents.push({
            type: seg.mode,
            durationMinutes: seg.durationMinutes,
            distanceMeters: seg.distanceMeters,
            instructions: seg.instructions,
            fromPlaceId: validActivities[i].place.id,
            toPlaceId: validActivities[i + 1].place.id,
          });
        }
      }
    }

    return {
      dayNumber: draftDay.dayNumber,
      title: draftDay.title,
      city: dayCity,
      country: dayCountry,
      anchorLocation: anchorPlace,
      activities: activitiesWithPhotos,
      interCityTransportToNext: draftDay.interCityTransportToNext ?? null,
      navigationEvents,
      suggestedHosts,
    };
  }

  /**
   * Get weather for the trip dates
   */
  async getWeatherForecast(location: string, startDate: string, endDate: string) {
    return this.executeTool('get_weather', { location, startDate, endDate });
  }

  /**
   * Check availability for a specific host
   */
  async checkHostAvailability(hostId: string, dates: string[], guestCount: number = 2) {
    return this.executeTool('check_availability', { hostId, dates, guestCount });
  }

  /**
   * Get the tool registry for direct tool access
   */
  getRegistry(): ToolRegistry {
    return this.registry;
  }
}
