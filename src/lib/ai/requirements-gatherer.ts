/**
 * Requirements Gatherer
 *
 * Drives a short conversational intake before the planner fires.
 * Each call extracts whatever the user's message contains, merges it into the
 * running PartialTripRequirements on the session, and either:
 *   - returns { isReady: true } when all required fields are present, or
 *   - returns { isReady: false, nextQuestion } with a single targeted question.
 *
 * This module is pure — no side-effects, no DB calls.
 * The orchestrator owns session mutation; this just returns updated state.
 */

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import {
  type PartialTripRequirements,
  type TripRequirements,
  PartialTripRequirementsSchema,
  firstMissingField,
  requirementsAreComplete,
  TravelStyleSchema,
  GroupCompositionSchema,
  REQUIRED_FIELD_ORDER,
} from '@/types/trip-requirements';
import { OPENAI_ORCHESTRATOR_MODEL } from './model-config';

// ============================================================================
// Internal LLM extraction schema
// ============================================================================

/**
 * What the LLM extracts from a single user message.
 * All fields are optional — only what's present in the message is set.
 */
const ExtractionSchema = z.object({
  destination: z
    .object({
      city: z.string().min(1),
      country: z.string().min(1),
      region: z.string().optional(),
    })
    .optional()
    .describe('Extracted city + country if the user named a destination'),

  durationDays: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional()
    .describe('Number of trip days if mentioned'),

  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(
      'Inferred start date in YYYY-MM-DD. Convert relative phrases like "next month", "June", "in 3 weeks" to an absolute date using today as the reference.',
    ),

  travelStyle: TravelStyleSchema.optional().describe(
    'Best-fit style: cultural | adventure | relaxation | foodie | luxury | budget',
  ),

  groupSize: z.number().int().min(1).max(20).optional(),
  groupComposition: GroupCompositionSchema.optional(),

  // Optional enrichment — captured when present, never asked for
  budget: z.enum(['budget', 'moderate', 'luxury']).optional(),
  interests: z.array(z.string()).optional(),
  dietaryRestrictions: z.array(z.string()).optional(),
  mobilityNeeds: z.enum(['full', 'limited']).optional(),
});

type Extraction = z.infer<typeof ExtractionSchema>;

// ============================================================================
// Question templates for each missing field
// ============================================================================

const QUESTIONS: Record<(typeof REQUIRED_FIELD_ORDER)[number], string> = {
  destination:
    "Where are you heading? Let me know the city and country and I'll start planning.",
  durationDays:
    'How many days are you thinking?',
  startDate:
    "When are you planning to go? Even a rough month works — I'll use that to tailor the weather and crowds info.",
  travelStyle:
    "What's the vibe you're after? Cultural sightseeing, adventure & outdoors, relaxation, food-focused, luxury, or budget-friendly?",
  groupSize:
    'How many people are travelling?',
  groupComposition:
    "And who's coming — just you (solo), a couple, family with kids, friends, or a business trip?",
};

// ============================================================================
// Deep merge helper
// ============================================================================

/**
 * Merges extracted fields into the existing partial requirements.
 * Existing non-null values are never overwritten — the user has to explicitly
 * ask to change something (handled by MODIFY_PLAN intent, not here).
 */
function mergeRequirements(
  existing: PartialTripRequirements,
  extracted: Extraction,
): PartialTripRequirements {
  const merged: PartialTripRequirements = { ...existing };

  if (extracted.destination && (!existing.destination?.city || !existing.destination?.country)) {
    merged.destination = {
      ...existing.destination,
      ...extracted.destination,
    };
  }
  if (extracted.durationDays != null && !existing.durationDays) {
    merged.durationDays = extracted.durationDays;
  }
  if (extracted.startDate && !existing.startDate) {
    merged.startDate = extracted.startDate;
  }
  if (extracted.travelStyle && !existing.travelStyle) {
    merged.travelStyle = extracted.travelStyle;
  }
  if (extracted.groupSize != null && !existing.groupSize) {
    merged.groupSize = extracted.groupSize;
  }
  if (extracted.groupComposition && !existing.groupComposition) {
    merged.groupComposition = extracted.groupComposition;
  }

  // Optional enrichment — always merge if present
  if (extracted.budget) merged.budget = extracted.budget;
  if (extracted.interests?.length) {
    merged.interests = [...(existing.interests ?? []), ...extracted.interests];
  }
  if (extracted.dietaryRestrictions?.length) {
    merged.dietaryRestrictions = [
      ...(existing.dietaryRestrictions ?? []),
      ...extracted.dietaryRestrictions,
    ];
  }
  if (extracted.mobilityNeeds) merged.mobilityNeeds = extracted.mobilityNeeds;

  return merged;
}

// ============================================================================
// Public API
// ============================================================================

export interface GatherResult {
  /** Updated requirements after merging the user's message */
  updated: PartialTripRequirements;
  /** True when all required fields are present — caller should proceed to planTrip() */
  isReady: boolean;
  /** The next question to ask the user, or null when isReady is true */
  nextQuestion: string | null;
  /** The completed requirements when isReady is true */
  requirements: TripRequirements | null;
}

/**
 * Process one user message against the current partial requirements.
 *
 * @param message    - The raw user message
 * @param existing   - Requirements accumulated so far (empty object on first message)
 * @param today      - ISO date string for relative date resolution (defaults to today)
 */
export async function gatherRequirements(
  message: string,
  existing: PartialTripRequirements,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<GatherResult> {
  // Fast path: if already complete (e.g. re-entry after MODIFY_PLAN), skip the LLM call
  if (requirementsAreComplete(existing)) {
    return { updated: existing, isReady: true, nextQuestion: null, requirements: existing };
  }

  // Step 1 — extract from message
  const { object: extracted } = await generateObject({
    model: openai(OPENAI_ORCHESTRATOR_MODEL),
    schema: ExtractionSchema,
    prompt: `
Today's date: ${today}

Extract structured trip planning information from the user's message.
Only populate fields that are explicitly or clearly implied by the message.
Leave all other fields absent (do not guess).

For travel style, infer it if the user uses words like:
- "foodie", "food-focused", "gastronomy" → foodie
- "relax", "beach", "spa", "chill" → relaxation
- "hike", "adventure", "active", "outdoor" → adventure
- "culture", "museums", "history", "art" → cultural
- "luxury", "high-end", "5-star" → luxury
- "cheap", "budget", "backpacker", "hostel" → budget

For group composition, infer:
- "just me", "solo", "alone", "by myself" → solo
- "my partner", "my wife/husband/boyfriend/girlfriend", "the two of us" → couple
- "kids", "children", "family" → family_with_kids
- "friends", "buddy", "mates", "group of" → friends
- "work", "conference", "business" → business

User message: "${message}"
    `.trim(),
  });

  // Step 2 — validate extraction (soft — only keep schema-valid fields)
  const parseResult = ExtractionSchema.safeParse(extracted);
  const safeExtraction: Extraction = parseResult.success ? parseResult.data : {};

  // Step 3 — merge
  const updated = mergeRequirements(existing, safeExtraction);

  // Step 4 — check completeness
  const missing = firstMissingField(updated);

  if (!missing) {
    // All required fields present — validate final shape
    const finalParse = PartialTripRequirementsSchema.safeParse(updated);
    const requirements = finalParse.success ? (updated as TripRequirements) : null;
    return { updated, isReady: true, nextQuestion: null, requirements };
  }

  // Step 5 — ask the next question
  // Group size and composition are related — ask them together if both missing
  let nextQuestion = QUESTIONS[missing];
  if (missing === 'groupSize' && !updated.groupComposition) {
    nextQuestion = QUESTIONS.groupSize + ' ' + QUESTIONS.groupComposition;
  } else if (missing === 'groupComposition' && updated.groupSize) {
    nextQuestion = QUESTIONS.groupComposition;
  }

  return { updated, isReady: false, nextQuestion, requirements: null };
}
