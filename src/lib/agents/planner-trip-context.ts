import { z } from 'zod';

const TripContextStopTypeSchema = z.enum(['CITY', 'REGION', 'ROAD_TRIP', 'TRAIL']);
const TripContextItemTypeSchema = z.enum([
  'SIGHT',
  'EXPERIENCE',
  'MEAL',
  'FREE_TIME',
  'TRANSPORT',
  'NOTE',
  'LODGING',
]);

export const TripContextV1ItemSchema = z.object({
  title: z.string(),
  type: TripContextItemTypeSchema,
  locationName: z.string().nullable(),
});

export const TripContextV1DaySchema = z.object({
  dayIndex: z.number().int(),
  title: z.string().nullable(),
  itemCount: z.number().int().nonnegative(),
  items: z.array(TripContextV1ItemSchema).optional(),
});

export const TripContextV1StopSchema = z.object({
  title: z.string(),
  type: TripContextStopTypeSchema,
  dayCount: z.number().int().nonnegative(),
  days: z.array(TripContextV1DaySchema),
});

export const TripContextV1Schema = z.object({
  tripId: z.string(),
  title: z.string().nullable(),
  status: z.string(),
  summary: z.object({
    stopCount: z.number().int().nonnegative(),
    dayCount: z.number().int().nonnegative(),
    itemCount: z.number().int().nonnegative(),
  }),
  knownPlaceNames: z.array(z.string()),
  stops: z.array(TripContextV1StopSchema),
});

export const TripContextEnvelopeSchema = z.object({
  schemaVersion: z.literal('trip_context_v1'),
  context: TripContextV1Schema,
});

export type TripContextV1 = z.infer<typeof TripContextV1Schema>;
export type TripContextEnvelope = z.infer<typeof TripContextEnvelopeSchema>;
