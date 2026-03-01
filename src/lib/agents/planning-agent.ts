import { openai } from '@ai-sdk/openai';
import { streamText, tool, stepCountIs, type ModelMessage, generateObject } from 'ai';
import { z } from 'zod';
import {
  semanticSearchHosts,
  semanticSearchExperiences,
  type SearchIntent,
} from '@/lib/semantic-search';
import { OPENAI_PLANNING_MODEL } from '@/lib/ai/model-config';
import { Agent, type AgentContext, type AgentStreamResult } from './agent';
import {
  detectRoadTripIntent,
  detectTransportPreference,
  extractFromToDestinations,
  normalizeDestinations,
} from './planner-helpers';
import { SYSTEM_PROMPT, TRIP_JSON_CONTEXT_GUIDE } from './planner-prompts';
import {
  getGenerationStartMessage,
  getQueuedMessage,
  plannerGenerationController,
} from './planner-generation';
import {
  DEFAULT_PLANNER_STATE,
  PlannerDeltaSchema,
  type PlannerDelta,
  type PlannerFlowState,
  buildPlannerGenerationSnapshot,
  buildPlannerRequest,
  destinationsEqual,
  getPlannerQuestion,
  isPlannerOnboardingTriggerMessage,
  mergeUnique,
  seedPlannerStateFromTrip,
} from './planner-state';
import {
  dedupeStrings,
  detectItineraryReadIntent,
  detectItineraryUpdateIntent,
  extractItineraryRemovalTargets,
  formatRemovalSummary,
  getRemovalCount,
  removeItineraryTargetsFromStops,
} from './planner-intent';
import {
  TripContextEnvelopeSchema,
  TripContextV1Schema,
} from './planner-trip-context';
import {
  GenerateItineraryInputSchema,
  resolveGenerateItineraryRequest,
} from './planner-generate';
import {
  getTripCurrentVersionForUser,
  loadTripPlanSnapshotForUser,
  saveTripPlanSnapshotForUser,
} from '@/lib/trips/repository';

export {
  buildPlannerRequest,
  detectItineraryReadIntent,
  detectItineraryUpdateIntent,
  extractItineraryRemovalTargets,
  getPlannerQuestion,
  removeItineraryTargetsFromStops,
};
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
    const { conversationController } = await import('@/lib/conversation/controller');
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
Planner Context:
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

Tool recommendations:
- flyToLocation: ${shouldFly ? 'recommended now' : 'optional / not required now'}
- generateItinerary: ${shouldGenerate ? 'recommended now' : 'not required now'}
- getCurrentItinerary: ${shouldGetCurrentItinerary ? 'recommended now' : 'not required now'}
- updateItinerary: ${shouldUpdateItinerary ? 'recommended now' : 'not required now'}
${itineraryRequest ? `- Suggested generateItinerary request: "${itineraryRequest}"` : ''}
${itineraryUpdateRequest ? `- Suggested updateItinerary request: "${itineraryUpdateRequest}"` : ''}
${nextQuestion ? `- If clarifying, target this gap: "${nextQuestionKey ?? 'missing info'}". Suggested phrasing: "${nextQuestion}"` : '- No clarification needed unless blocked.'}

Trip JSON reference:
${TRIP_JSON_CONTEXT_GUIDE}

Guidance:
- Use your judgment and current user intent to decide which tool(s) to call.
- If editing an existing itinerary and details are unclear, getCurrentItinerary first.
- For itinerary edits, anchor follow-up questions to JSON keys (context.stops[].title, context.stops[].days[].title, context.stops[].days[].items[].title/locationName).
- Do not run a full preference questionnaire for edit/read requests.
- Keep chat concise after tool calls.`;

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
          description: 'Generate a detailed multi-day travel itinerary. Prefer structured inputs (destinations, dates/duration, pace, budget, mustSee/avoid, transportPreference, etc.) when available; request remains backward-compatible.',
          inputSchema: GenerateItineraryInputSchema,
          execute: async (input) => {
            try {
              const resolved = resolveGenerateItineraryRequest(input, nextState);
              let expectedVersion: number | undefined;
              if (context.userId && context.tripId) {
                const version = await getTripCurrentVersionForUser(context.userId, context.tripId);
                if (typeof version === 'number') {
                  expectedVersion = version;
                }
              }
              const snapshot = buildPlannerGenerationSnapshot({
                request: resolved.request,
                sessionId,
                tripId: context.tripId ?? null,
                userId: context.userId ?? null,
                state: resolved.resolvedState,
                expectedVersion,
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
                expectedVersion,
                normalizedRequest: resolved.request,
                usedStructuredInput: resolved.usedStructuredInput,
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
            'Load the current persisted itinerary for the active trip so the assistant can reason about specific stops, days, and activities before making edits. Returns a versioned context payload (schemaVersion + context).',
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
              const snapshot = await loadTripPlanSnapshotForUser(context.userId, context.tripId);
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
              const contextPayload = {
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
              };
              const parsedContext = TripContextV1Schema.safeParse(contextPayload);
              if (!parsedContext.success) {
                const detail = parsedContext.error.issues
                  .slice(0, 6)
                  .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
                  .join('; ');
                return {
                  success: false,
                  error: `Trip context serialization failed. ${detail}`,
                };
              }
              const envelope = TripContextEnvelopeSchema.parse({
                schemaVersion: 'trip_context_v1',
                context: parsedContext.data,
              });

              return {
                success: true,
                schemaVersion: envelope.schemaVersion,
                context: envelope.context,
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
              const snapshot = await loadTripPlanSnapshotForUser(context.userId, context.tripId);
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

              await saveTripPlanSnapshotForUser({
                tripId: snapshot.trip.id,
                userId: context.userId,
                stops: updatedStops,
                expectedVersion: snapshot.trip.currentVersion,
                audit: {
                  source: 'planner',
                  actor: 'planning-agent',
                  reason: 'planner_update_itinerary',
                },
              });

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
