import { z } from 'zod';

const TripAnchorTypeSchema = z.enum(['CITY', 'REGION', 'ROAD_TRIP', 'TRAIL']);
const TripItineraryItemTypeSchema = z.enum([
  'SIGHT',
  'EXPERIENCE',
  'MEAL',
  'FREE_TIME',
  'TRANSPORT',
  'NOTE',
  'LODGING',
]);

export const TripPlanLocationInputSchema = z.object({
  name: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  placeId: z.string().optional(),
});

export const TripPlanItemInputSchema = z.object({
  type: TripItineraryItemTypeSchema.optional(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  locationName: z.string().nullable().optional(),
  placeId: z.string().nullable().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  experienceId: z.string().nullable().optional(),
  hostId: z.string().nullable().optional(),
  orderIndex: z.number().int().optional(),
  createdByAI: z.boolean().optional(),
});

export const TripPlanDayInputSchema = z.object({
  dayIndex: z.number().int(),
  date: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  suggestedHosts: z.array(z.unknown()).optional(),
  items: z.array(TripPlanItemInputSchema).optional(),
});

export const TripPlanStopInputSchema = z.object({
  title: z.string().optional(),
  city: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  placeId: z.string().optional(),
  type: TripAnchorTypeSchema.optional(),
  order: z.number().int().optional(),
  locations: z.array(TripPlanLocationInputSchema).optional(),
  days: z.array(TripPlanDayInputSchema).optional(),
});

export const TripPlanWritePayloadSchema = z.object({
  stops: z.array(TripPlanStopInputSchema),
  preferences: z.record(z.string(), z.unknown()).nullable().optional(),
  title: z.string().optional(),
});

export type TripPlanLocationInput = z.infer<typeof TripPlanLocationInputSchema>;
export type TripPlanItemInput = z.infer<typeof TripPlanItemInputSchema>;
export type TripPlanDayInput = z.infer<typeof TripPlanDayInputSchema>;
export type TripPlanStopInput = z.infer<typeof TripPlanStopInputSchema>;
export type TripPlanWritePayload = z.infer<typeof TripPlanWritePayloadSchema>;

export type TripPlanValidationIssue = {
  path: string;
  message: string;
  code: string;
};

export function formatTripPlanValidationIssues(error: z.ZodError): TripPlanValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : 'root',
    message: issue.message,
    code: issue.code,
  }));
}
