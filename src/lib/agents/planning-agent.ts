import { openai } from '@ai-sdk/openai';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { HOSTS, type Host } from '@/lib/data/hosts';
import {
  createOrchestratorJob,
  updateOrchestratorJob,
  completeOrchestratorJob,
  failOrchestratorJob,
} from '@/lib/ai/orchestrator-jobs';
import type { DraftItinerary } from '@/lib/ai/orchestrator';
import { buildHostMarkersFromPlan } from '@/lib/ai/host-markers';
import { 
  semanticSearchHosts, 
  semanticSearchExperiences, 
  type SearchIntent 
} from '@/lib/semantic-search';
import { Agent, AgentContext } from './agent';
import { OPENAI_PLANNING_MODEL } from '@/lib/ai/model-config';

// Schema for intent extraction
const searchIntentSchema = z.object({
  categories: z.array(z.string()).describe('Relevant experience categories like food-drink, arts-culture, outdoor-adventure, nightlife-social, wellness, learning, family'),
  keywords: z.array(z.string()).describe('Key terms and concepts the user is interested in'),
  location: z.string().optional().describe('City or country mentioned'),
  preferences: z.array(z.string()).describe('User preferences like solo travel, budget, time of day, etc'),
  activities: z.array(z.string()).describe('Specific activities mentioned like cooking, hiking, tours, etc'),
});

// System prompt that handles semantic search and itinerary planning
const SYSTEM_PROMPT = `You are a friendly, helpful travel planner for Localhost, a platform that connects travelers with locals and authentic experiences.

CRITICAL TOOL RULES - ALWAYS FOLLOW THESE:

1. **LOCATION REQUESTS → ALWAYS use flyToLocation tool**
   When user mentions ANY location (city, country, place), you MUST call \`flyToLocation\` FIRST.
   Examples that REQUIRE flyToLocation:
   - "Show me Paris" → flyToLocation(lat: 48.8566, lng: 2.3522, label: "Paris")
   - "Take me to Tokyo" → flyToLocation(lat: 35.6762, lng: 139.6503, label: "Tokyo")
   - "Go to Italy" → flyToLocation(lat: 41.9028, lng: 12.4964, label: "Italy")
   - "I want to see..." → flyToLocation with appropriate coordinates
   DO NOT just describe a place without calling the tool!

2. **TRIP PLANNING → ALWAYS use generateItinerary tool**
   When user asks to plan a trip, vacation, or itinerary, call \`generateItinerary\`.
   Examples: "Plan my trip to...", "5 days in...", "What should I do in..."

3. **HOSTS/EXPERIENCES → Use semanticSearch tool**
   For finding hosts or experiences, use semanticSearch with appropriate searchType.

Your role depends on the MODE indicated in the user's message:

**LOCALS MODE** (when message contains "[Mode: locals]"):
- Use semanticSearch with searchType "hosts"

**EXPERIENCES MODE** (when message contains "[Mode: experiences]"):
- Use semanticSearch with searchType "experiences"

**ITINERARY MODE** (default):
- Use generateItinerary for trip planning
- Use flyToLocation for location viewing

Guidelines:
- ALWAYS call tools BEFORE responding with text about locations
- Keep text responses blunt and brief AFTER tool execution
- Never pretend to fly somewhere without calling flyToLocation

STYLE RULES (STRICT):
- Be warm, calm, and professional. Keep responses concise and practical.
- Do NOT provide multiple options unless the user explicitly asks.
- Ask at most one question, only if required to proceed.
- No emojis, no exclamation points, no filler.
- For trip planning, do NOT narrate the itinerary in chat. The UI will show details.
- Trip days should be city-based with real sights/POIs (not travel-day activities).`;

type HydrationTotals = {
  geocodes: number;
  routes: number;
  hosts: number;
};

function getHydrationTotals(draft: DraftItinerary): HydrationTotals {
  const geocodes = draft.days.reduce((sum, day) => sum + day.activities.length + 1, 0);
  const routes = draft.days.filter((day) => day.activities.length > 1).length;
  const hosts = draft.days.length;
  return { geocodes, routes, hosts };
}

function buildProgress(
  geocoded: number,
  totals: HydrationTotals,
  routed: number,
  hosted: number
) {
  if (geocoded < totals.geocodes) {
    return {
      stage: 'geocoding' as const,
      message: 'Resolving places',
      current: geocoded,
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

export class PlanningAgent implements Agent {
  name = 'planning';
  description = 'Helps users plan trips and find hosts';

  async process(messages: any[], context: AgentContext) {
    // Get the last user message text
    const lastUserMessage = messages[messages.length - 1];
    const userMessageText = typeof lastUserMessage?.content === 'string'
      ? lastUserMessage.content
      : (Array.isArray(lastUserMessage?.content)
          ? lastUserMessage.content.map((p: any) => 'text' in p ? p.text : '').join(' ')
          : '');

    // Trip planning patterns - should use generateItinerary, NOT flyToLocation
    const tripPlanningPatterns = [
      /\b(plan|planning|itinerary|trip|vacation|travel|days?\s+in|schedule|suggest|recommend)\b/i,
      /\b(what\s+should\s+i\s+do|things\s+to\s+do|places\s+to\s+visit|must\s+see)\b/i,
      /\b(\d+\s+days?|\d+\s+nights?|week|weekend)\b/i,
    ];

    // Explicit fly-to patterns - should force flyToLocation
    const flyToPatterns = [
      /\b(show\s+me|take\s+me\s+to|fly\s+to|go\s+to|zoom\s+to|navigate\s+to)\b/i,
      /\b(where\s+is|find\s+on\s+map|show\s+on\s+globe)\b/i,
    ];

    const isTripPlanning = tripPlanningPatterns.some(pattern => pattern.test(userMessageText));
    const isFlyToRequest = flyToPatterns.some(pattern => pattern.test(userMessageText));
    
    // Only force flyToLocation if it's a fly-to request AND NOT a trip planning request
    const isLocationRequest = isFlyToRequest && !isTripPlanning;
    
    console.log('[Agents] PlanningAgent intent detection:', { 
      userMessage: userMessageText.substring(0, 100),
      isTripPlanning,
      isFlyToRequest,
      isLocationRequest,
    });
  
    // Determine toolChoice based on intent
    const toolChoice = isLocationRequest 
      ? { type: 'tool' as const, toolName: 'flyToLocation' as const }
      : 'auto' as const;
  
    return streamText({
      model: openai(OPENAI_PLANNING_MODEL),
      system: SYSTEM_PROMPT,
      messages,
      toolChoice,
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
            console.log('Invoking ItineraryOrchestrator for:', request);
            const { ItineraryOrchestrator } = await import('@/lib/ai/orchestrator');
  
            try {
              const orchestrator = new ItineraryOrchestrator();
              const startTime = Date.now();
              const draftResult = await orchestrator.planTripDraft(request);
              console.log(`[PlanningAgent] planTripDraft completed in ${Date.now() - startTime}ms`);
  
              if (!draftResult.plan) {
                return {
                  success: false,
                  error: 'Unable to locate the main city for this trip. Try a nearby city name.',
                };
              }
  
              const totals = getHydrationTotals(draftResult.context.draft);
              const draftMessage = `Draft ready: ${draftResult.plan.title}. Refining details...`;
              const job = createOrchestratorJob(request, {
                stage: 'draft',
                message: draftMessage,
                current: 0,
                total: totals.geocodes,
              });
  
              let geocoded = 0;
              let routed = 0;
              let hosted = 0;
  
              const updateProgress = () => {
                const progress = buildProgress(geocoded, totals, routed, hosted);
                updateOrchestratorJob(job.id, { status: 'running', progress });
              };
  
              const hydrationOrchestrator = new ItineraryOrchestrator(undefined, {
                onToolResult: (toolName) => {
                  if (toolName === 'resolve_place') geocoded += 1;
                  if (toolName === 'generate_route') routed += 1;
                  if (toolName === 'search_localhosts') hosted += 1;
                  updateProgress();
                },
                onDayProcessed: (dayNumber, total) => {
                  updateOrchestratorJob(job.id, {
                    status: 'running',
                    progress: {
                      stage: 'geocoding',
                      message: `Processing day ${dayNumber} of ${total}`,
                      current: geocoded,
                      total: totals.geocodes,
                    },
                  });
                },
              });
  
              updateProgress();
              void hydrationOrchestrator
                .planTripFromDraft(
                  request,
                  draftResult.context.draft,
                  draftResult.context.tripAnchor
                )
                .then((plan) => {
                  const hostMarkers = buildHostMarkersFromPlan(plan);
                  completeOrchestratorJob(job.id, plan, hostMarkers);
                })
                .catch((error) => {
                  failOrchestratorJob(
                    job.id,
                    error instanceof Error ? error.message : 'Failed to generate itinerary.'
                  );
                });
  
              return {
                success: true,
                plan: draftResult.plan,
                hostMarkers: [],
                jobId: job.id,
                message: draftMessage,
              };
            } catch (error) {
              console.error('Orchestrator failed:', error);
              return {
                success: false,
                error: 'Failed to generate itinerary. Please try again.',
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
    });
  }
}
