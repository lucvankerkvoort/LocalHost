import { z } from 'zod';

// ============================================================================
// Enum schemas — used both for validation and LLM structured output
// ============================================================================

export const TravelStyleSchema = z.enum([
  'cultural',    // Museums, history, architecture, arts
  'adventure',   // Hiking, outdoor activities, adrenaline
  'relaxation',  // Beaches, spas, slow pace
  'foodie',      // Markets, restaurants, cooking, street food
  'luxury',      // High-end hotels, fine dining, private tours
  'budget',      // Hostels, street food, free attractions
]);

export const GroupCompositionSchema = z.enum([
  'solo',
  'couple',
  'family_with_kids',
  'friends',
  'business',
]);

// ============================================================================
// Full requirements — every field must be present before generation starts
// ============================================================================

export const TripRequirementsSchema = z.object({
  // Where
  destination: z.object({
    city: z.string().min(1),
    country: z.string().min(1),
    region: z.string().optional().describe('State or province — required for US locations'),
  }),

  // When & how long
  durationDays: z.number().int().min(1).max(30),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .describe('First day of the trip'),

  // Who & how
  travelStyle: TravelStyleSchema,
  groupSize: z.number().int().min(1).max(20),
  groupComposition: GroupCompositionSchema,

  // Optional enrichment — collected if the user mentions them but never blocked on
  budget: z.enum(['budget', 'moderate', 'luxury']).optional(),
  interests: z.array(z.string()).optional().describe('Specific interests, e.g. ["street art", "Jazz music"]'),
  dietaryRestrictions: z.array(z.string()).optional(),
  mobilityNeeds: z.enum(['full', 'limited']).optional(),
});

export type TripRequirements = z.infer<typeof TripRequirementsSchema>;

// ============================================================================
// Partial version — accumulated during the gathering conversation
// ============================================================================

// Manually deep-partial because Zod v3 .deepPartial() is not available in this version.
// The nested destination object needs its own .partial() call.
export const PartialTripRequirementsSchema = TripRequirementsSchema.extend({
  destination: z
    .object({
      city: z.string().min(1),
      country: z.string().min(1),
      region: z.string().optional(),
    })
    .partial()
    .optional(),
}).partial();

export type PartialTripRequirements = z.infer<typeof PartialTripRequirementsSchema>;

// ============================================================================
// Completeness helpers
// ============================================================================

/**
 * The required fields in priority order.
 * Destination is asked first, then duration+dates together, then who/style.
 */
export const REQUIRED_FIELD_ORDER = [
  'destination',
  'durationDays',
  'startDate',
  'travelStyle',
  'groupSize',
  'groupComposition',
] as const satisfies ReadonlyArray<keyof TripRequirements>;

export type RequiredField = (typeof REQUIRED_FIELD_ORDER)[number];

/**
 * Returns the first required field that is still missing, or null if complete.
 */
export function firstMissingField(r: PartialTripRequirements): RequiredField | null {
  if (!r.destination?.city || !r.destination?.country) return 'destination';
  if (!r.durationDays) return 'durationDays';
  if (!r.startDate) return 'startDate';
  if (!r.travelStyle) return 'travelStyle';
  if (!r.groupSize) return 'groupSize';
  if (!r.groupComposition) return 'groupComposition';
  return null;
}

/**
 * Returns true when every required field is present and valid.
 */
export function requirementsAreComplete(
  r: PartialTripRequirements,
): r is TripRequirements {
  return firstMissingField(r) === null;
}

/**
 * Build a human-readable prompt suffix from completed requirements.
 * Injected into the draftItinerary system prompt so the LLM has full context.
 */
export function formatRequirementsForPrompt(r: TripRequirements): string {
  const lines: string[] = [
    `Destination: ${r.destination.city}, ${r.destination.country}${r.destination.region ? ` (${r.destination.region})` : ''}`,
    `Duration: ${r.durationDays} day${r.durationDays === 1 ? '' : 's'}`,
    `Start date: ${r.startDate}`,
    `Travel style: ${r.travelStyle}`,
    `Group: ${r.groupSize} ${r.groupSize === 1 ? 'person' : 'people'} — ${r.groupComposition.replace('_', ' ')}`,
  ];

  if (r.budget) lines.push(`Budget tier: ${r.budget}`);
  if (r.interests?.length) lines.push(`Interests: ${r.interests.join(', ')}`);
  if (r.dietaryRestrictions?.length) lines.push(`Dietary: ${r.dietaryRestrictions.join(', ')}`);
  if (r.mobilityNeeds === 'limited') lines.push('Mobility: limited — avoid long walks, stairs, or strenuous activities');

  return lines.map(l => `- ${l}`).join('\n');
}
