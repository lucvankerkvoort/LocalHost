import { z } from 'zod';

// --- primitive schemas ---

export const GeoPointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export const PlaceSchema = z.object({
  id: z.string().describe('Unique identifier for the place'),
  name: z.string(),
  description: z.string().optional(),
  location: GeoPointSchema.describe('Resolved coordinates'),
  address: z.string().optional(),
  city: z.string().optional(),
  category: z.enum(['landmark', 'museum', 'restaurant', 'park', 'other']).optional(),
  imageUrl: z.string().optional(),
});

export const NavigationActionSchema = z.object({
  type: z.enum(['walk', 'transit', 'drive']),
  durationMinutes: z.number(),
  distanceMeters: z.number(),
  instructions: z.string().describe('Short summary direction, e.g. "Take line 12"'),
  fromPlaceId: z.string(),
  toPlaceId: z.string(),
});

export const HostCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  headline: z.string(),
  photoUrl: z.string(),
  rating: z.number(),
  reviewCount: z.number(),
  tags: z.array(z.string()),
  distanceFromAnchor: z.number().describe('Distance in meters from the day\'s anchor location').optional(),
});

// --- orchestrator domain models ---

export const ActivitySchema = z.object({
  id: z.string(),
  place: PlaceSchema,
  timeSlot: z.enum(['morning', 'afternoon', 'evening']),
  durationMinutes: z.number().optional(),
  notes: z.string().optional(),
});

export const DayPlanSchema = z.object({
  dayNumber: z.number(),
  date: z.string().optional(), // ISO date string if available
  title: z.string().describe('Theme of the day, e.g. "Art & History"'),
  anchorLocation: PlaceSchema.optional().describe('Central geographic point used to find nearby hosts (null if geocoding failed)'),
  activities: z.array(ActivitySchema),
  navigationEvents: z.array(NavigationActionSchema).optional(),
  suggestedHosts: z.array(HostCardSchema).describe('List of >= 6 hosts near the anchor'),
});

export const ItineraryPlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  request: z.string().describe('Original user prompt'),
  days: z.array(DayPlanSchema),
  summary: z.string().describe('Brief executive summary of the entire trip'),
});

// --- Types ---

export type GeoPoint = z.infer<typeof GeoPointSchema>;
export type Place = z.infer<typeof PlaceSchema>;
export type NavigationAction = z.infer<typeof NavigationActionSchema>;
export type HostCard = z.infer<typeof HostCardSchema>;
export type Activity = z.infer<typeof ActivitySchema>;
export type DayPlan = z.infer<typeof DayPlanSchema>;
export type ItineraryPlan = z.infer<typeof ItineraryPlanSchema>;
