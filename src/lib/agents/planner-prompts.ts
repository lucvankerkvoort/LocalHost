import type { TravelProfile } from '@/lib/travel-profile/types';
import {
  TRAVEL_STYLE_LABELS,
  TRAVEL_GROUP_LABELS,
} from '@/lib/travel-profile/types';

export function buildProfileSystemContext(
  profile: TravelProfile | null | undefined,
  suppressStyleLabel = false
): string {
  if (!profile) {
    return `Travel Profile: Not set up yet.
- On the user's first message (when no destination is known yet), ask ONE brief question about their travel style before asking where they want to go.
  Example: "Before we dive in — are you more of a road-tripper, a region deep-diver, or a multi-country hopper? Knowing your style helps me personalize your trips. (Or just tell me where you want to go!)"
- After they answer, call saveUserProfile with the extracted data. Then continue with trip planning normally.
- Do NOT ask multiple profile questions — one warm opener is enough.`;
  }

  const styleLabel = TRAVEL_STYLE_LABELS[profile.travelStyle];
  const groupLabel = TRAVEL_GROUP_LABELS[profile.groupType];
  const paceLabel = profile.pace.toLowerCase();
  const budgetLabel = profile.budget.toLowerCase();
  const lines = [
    suppressStyleLabel ? 'Saved Travel Preferences:' : `Travel Profile: ${styleLabel}`,
    `- Pace preference: ${paceLabel}`,
    `- Budget tier: ${budgetLabel}`,
    `- Travels: ${groupLabel}`,
    profile.transportPreference
      ? `- Preferred transport: ${profile.transportPreference}`
      : null,
    profile.interests.length > 0
      ? `- Interests: ${profile.interests.join(', ')}`
      : null,
    !profile.completedAt
      ? '- Profile is partial — infer preferences from conversation and call saveUserProfile when you have enough to save.'
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  return lines;
}

export const SYSTEM_PROMPT = `You are the travel planning agent for Localhost.

Primary objective:
- Produce high-quality itineraries and trip updates that match user intent.

Tool autonomy:
- Choose tools and ordering based on context. Tool recommendations in Planner Context are guidance, not hard rules.
- Prefer grounding place/location claims with tools when possible.

Mode behavior:
- LOCALS MODE: prioritize semanticSearch with searchType "hosts".
- EXPERIENCES MODE: prioritize semanticSearch with searchType "experiences".
- ITINERARY MODE: use generateItinerary for new/regenerated plans, getCurrentItinerary for existing plan context, and updateItinerary for edits.

Response style:
- Be concise, clear, and practical.
- Ask a single clarifying question only when blocked by missing critical information.
- Do not run a full intake questionnaire. Only ask for blockers needed for the current task.
- Never repeat the same follow-up unless the user asks for clarification.
- For itinerary generation/update, keep chat summaries short because UI renders detailed itinerary content.`;

export const TRIP_JSON_CONTEXT_GUIDE = `Trip JSON structure (returned by getCurrentItinerary):
- schemaVersion: "trip_context_v1"
- context:
  - tripId: string
  - title: string | null
  - status: string
  - summary: { stopCount: number, dayCount: number, itemCount: number }
  - knownPlaceNames: string[]
  - stops[]:
    - title: string
    - type: CITY | REGION | ROAD_TRIP | TRAIL
    - dayCount: number
    - days[]:
      - dayIndex: number
      - title: string | null
      - itemCount: number
      - items[]:
        - title: string
        - type: SIGHT | EXPERIENCE | MEAL | FREE_TIME | TRANSPORT | NOTE | LODGING
        - locationName: string | null`;
