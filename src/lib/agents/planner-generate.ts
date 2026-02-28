import { z } from 'zod';
import { normalizeDestinations } from './planner-helpers';
import { buildPlannerRequest, type PlannerFlowState } from './planner-state';

const PlannerBudgetSchema = z.enum(['budget', 'mid', 'premium']);
const PlannerPaceSchema = z.enum(['relaxed', 'balanced', 'packed']);

export const GenerateItineraryInputSchema = z
  .object({
    request: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Natural-language trip request. Backward-compatible with existing callers.'),
    destinations: z
      .array(z.string().trim().min(1))
      .optional()
      .describe('Ordered destinations/cities, e.g. ["Los Angeles", "Yosemite", "Zion"]'),
    startDate: z.string().optional().describe('Trip start date in YYYY-MM-DD format'),
    endDate: z.string().optional().describe('Trip end date in YYYY-MM-DD format'),
    durationDays: z.number().int().positive().optional().describe('Trip length in days'),
    goalTheme: z.string().optional().describe('Theme/goals, e.g. foodie, national parks'),
    partySize: z.number().int().positive().optional(),
    partyType: z.string().optional(),
    budget: PlannerBudgetSchema.optional(),
    pace: PlannerPaceSchema.optional(),
    mustSee: z.array(z.string().trim().min(1)).optional(),
    avoid: z.array(z.string().trim().min(1)).optional(),
    lodgingArea: z.string().optional(),
    transportPreference: z.string().optional(),
    dailyStartPreference: z.string().optional(),
    latestEndTime: z.string().optional(),
    foodPreferences: z.array(z.string().trim().min(1)).optional(),
    accessibilityNeeds: z.string().optional(),
    hostExperiences: z.boolean().optional(),
    hostExperiencesPerCity: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    const hasRequest = typeof value.request === 'string' && value.request.trim().length > 0;
    const hasDestinations = Array.isArray(value.destinations) && value.destinations.length > 0;
    if (!hasRequest && !hasDestinations) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['request'],
        message: 'Provide either request or destinations.',
      });
    }
  });

export type GenerateItineraryInput = z.infer<typeof GenerateItineraryInputSchema>;

function normalizeStringList(values: string[] | undefined): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const cleaned = values.map((value) => value.trim()).filter((value) => value.length > 0);
  return cleaned.length > 0 ? cleaned : [];
}

function hasStructuredOverrides(input: GenerateItineraryInput): boolean {
  return (
    Array.isArray(input.destinations) ||
    typeof input.startDate === 'string' ||
    typeof input.endDate === 'string' ||
    typeof input.durationDays === 'number' ||
    typeof input.goalTheme === 'string' ||
    typeof input.partySize === 'number' ||
    typeof input.partyType === 'string' ||
    typeof input.budget === 'string' ||
    typeof input.pace === 'string' ||
    Array.isArray(input.mustSee) ||
    Array.isArray(input.avoid) ||
    typeof input.lodgingArea === 'string' ||
    typeof input.transportPreference === 'string' ||
    typeof input.dailyStartPreference === 'string' ||
    typeof input.latestEndTime === 'string' ||
    Array.isArray(input.foodPreferences) ||
    typeof input.accessibilityNeeds === 'string' ||
    typeof input.hostExperiences === 'boolean' ||
    typeof input.hostExperiencesPerCity === 'number'
  );
}

function buildStructuredConstraintLines(input: GenerateItineraryInput): string[] {
  const lines: string[] = [];
  if (Array.isArray(input.destinations) && input.destinations.length > 0) {
    lines.push(`Destinations (ordered): ${input.destinations.join(', ')}`);
  }
  if (input.startDate || input.endDate) {
    lines.push(`Dates: ${input.startDate ?? 'unset'} to ${input.endDate ?? 'unset'}`);
  }
  if (typeof input.durationDays === 'number') lines.push(`Duration: ${input.durationDays} days`);
  if (input.goalTheme) lines.push(`Theme: ${input.goalTheme}`);
  if (typeof input.partySize === 'number' || input.partyType) {
    lines.push(`Party: ${input.partySize ?? ''} ${input.partyType ?? ''}`.trim());
  }
  if (input.budget) lines.push(`Budget: ${input.budget}`);
  if (input.pace) lines.push(`Pace: ${input.pace}`);
  if (Array.isArray(input.mustSee)) {
    lines.push(`Must-see: ${input.mustSee.length > 0 ? input.mustSee.join(', ') : 'none'}`);
  }
  if (Array.isArray(input.avoid)) {
    lines.push(`Avoid: ${input.avoid.length > 0 ? input.avoid.join(', ') : 'none'}`);
  }
  if (input.lodgingArea) lines.push(`Lodging constraints: ${input.lodgingArea}`);
  if (input.transportPreference) lines.push(`Transport between cities: ${input.transportPreference}`);
  if (input.dailyStartPreference || input.latestEndTime) {
    lines.push(
      `Daily schedule: ${input.dailyStartPreference ?? 'flexible'}${input.latestEndTime ? `, latest end ${input.latestEndTime}` : ''}`
    );
  }
  if (Array.isArray(input.foodPreferences)) {
    lines.push(
      `Food preferences: ${input.foodPreferences.length > 0 ? input.foodPreferences.join(', ') : 'none'}`
    );
  }
  if (input.accessibilityNeeds) lines.push(`Accessibility: ${input.accessibilityNeeds}`);
  if (typeof input.hostExperiences === 'boolean') {
    lines.push(
      `Host experiences: ${input.hostExperiences ? `yes${input.hostExperiencesPerCity ? `, ${input.hostExperiencesPerCity} per city` : ''}` : 'no'}`
    );
  }
  return lines;
}

export function resolveGenerateItineraryRequest(
  input: GenerateItineraryInput,
  fallbackState: PlannerFlowState
): { request: string; resolvedState: PlannerFlowState; usedStructuredInput: boolean } {
  const normalizedDestinations = normalizeDestinations(normalizeStringList(input.destinations) ?? []);
  const normalizedMustSee = normalizeStringList(input.mustSee);
  const normalizedAvoid = normalizeStringList(input.avoid);
  const normalizedFoodPreferences = normalizeStringList(input.foodPreferences);

  const resolvedState: PlannerFlowState = {
    ...fallbackState,
    destinations:
      normalizedDestinations.length > 0 ? normalizedDestinations : fallbackState.destinations,
    destinationScope:
      normalizedDestinations.length > 1
        ? 'multi_city'
        : normalizedDestinations.length === 1
          ? 'city'
          : fallbackState.destinationScope,
    needsCities: normalizedDestinations.length > 0 ? false : fallbackState.needsCities,
    startDate: input.startDate ?? fallbackState.startDate,
    endDate: input.endDate ?? fallbackState.endDate,
    durationDays: input.durationDays ?? fallbackState.durationDays,
    goalTheme: input.goalTheme ?? fallbackState.goalTheme,
    partySize: input.partySize ?? fallbackState.partySize,
    partyType: input.partyType ?? fallbackState.partyType,
    budget: input.budget ?? fallbackState.budget,
    pace: input.pace ?? fallbackState.pace,
    mustSee: normalizedMustSee ?? fallbackState.mustSee,
    mustSeeProvided:
      normalizedMustSee !== undefined ? true : fallbackState.mustSeeProvided,
    avoid: normalizedAvoid ?? fallbackState.avoid,
    avoidProvided: normalizedAvoid !== undefined ? true : fallbackState.avoidProvided,
    lodgingArea: input.lodgingArea ?? fallbackState.lodgingArea,
    transportPreference: input.transportPreference ?? fallbackState.transportPreference,
    dailyStartPreference: input.dailyStartPreference ?? fallbackState.dailyStartPreference,
    latestEndTime: input.latestEndTime ?? fallbackState.latestEndTime,
    foodPreferences: normalizedFoodPreferences ?? fallbackState.foodPreferences,
    foodPreferencesProvided:
      normalizedFoodPreferences !== undefined ? true : fallbackState.foodPreferencesProvided,
    accessibilityNeeds: input.accessibilityNeeds ?? fallbackState.accessibilityNeeds,
    hostExperiences:
      typeof input.hostExperiences === 'boolean'
        ? input.hostExperiences
        : fallbackState.hostExperiences,
    hostExperiencesPerCity:
      input.hostExperiencesPerCity ?? fallbackState.hostExperiencesPerCity,
  };

  const explicitRequest = typeof input.request === 'string' ? input.request.trim() : '';
  const usedStructuredInput = hasStructuredOverrides(input);
  if (!explicitRequest) {
    return {
      request: buildPlannerRequest(resolvedState),
      resolvedState,
      usedStructuredInput,
    };
  }

  if (!usedStructuredInput) {
    return {
      request: explicitRequest,
      resolvedState,
      usedStructuredInput: false,
    };
  }

  const constraintLines = buildStructuredConstraintLines(input);
  if (constraintLines.length === 0) {
    return {
      request: explicitRequest,
      resolvedState,
      usedStructuredInput: true,
    };
  }

  return {
    request: `${explicitRequest}\n\nStructured constraints:\n${constraintLines
      .map((line) => `- ${line}`)
      .join('\n')}`,
    resolvedState,
    usedStructuredInput: true,
  };
}
