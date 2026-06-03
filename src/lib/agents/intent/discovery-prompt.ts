import type { TripIntent } from './types';

/**
 * Returns a system prompt instruction block when the LLM needs to ask one clarifying
 * question to resolve spatial pattern before planning can begin.
 *
 * Only fires on the FIRST unresolved dimension that changes strategy routing.
 * Returns empty string when intent is clear enough to proceed.
 */
export function buildDiscoveryPrompt(intent: TripIntent, hasDestinations: boolean): string {
  // Spatial pattern is the only dimension that determines which strategy (and tool set)
  // to use. Other dimensions (activity, mobility, pace) can be resolved during normal
  // planning conversation once the spatial pattern is known.
  if (!intent.unresolvedDimensions.includes('spatialPattern')) return '';

  // If destinations are already set we can infer spatial pattern from their count.
  if (hasDestinations) return '';

  // Map mobility clues to a suggested framing even without spatial clarity
  const mobilityHint =
    intent.mobilityMode === 'OWN_CAR' || intent.mobilityMode === 'RV'
      ? ' (driving)'
      : intent.mobilityMode === 'FLIGHTS_ONLY'
      ? ' (flying between stops)'
      : '';

  return `Intent Discovery${mobilityHint}:
- The user's travel mode is not yet clear. Before generating any itinerary, ask ONE natural question:
  "Are you thinking of staying in one place and exploring the surrounding area, or moving between different cities?"
- Keep it conversational — one sentence, not a form. Do not list options as bullet points.
- Do NOT generate an itinerary until you understand whether this is a base-and-explore or multi-stop trip.
- After they answer, continue with planning immediately.`;
}
