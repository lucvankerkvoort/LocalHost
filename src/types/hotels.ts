import { z } from 'zod';

// --- Hotel search result (from Amadeus) ---

export const HotelResultSchema = z.object({
  hotelId: z.string(),
  name: z.string(),
  stars: z.number().min(1).max(5).optional(),
  lat: z.number(),
  lng: z.number(),
  address: z.string().optional(),
  city: z.string(),
  country: z.string(),
  pricePerNightCents: z.number().int().positive().optional(),
  currency: z.string().default('USD'),
  thumbnailUrl: z.string().url().optional(),
  amenities: z.array(z.string()).default([]),
  affiliateUrl: z.string().url(),
});

export type HotelResult = z.infer<typeof HotelResultSchema>;

// --- What gets stored in ItineraryItem.metadataJson for LODGING items ---

export const LodgingMetadataSchema = z.object({
  provider: z.literal('booking_com'),
  hotelId: z.string().optional(),
  hotelName: z.string(),
  stars: z.number().min(1).max(5).optional(),
  pricePerNightCents: z.number().int().positive().optional(),
  currency: z.string().default('USD'),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  nights: z.number().int().min(1),
  guests: z.number().int().min(1).default(1),
  thumbnailUrl: z.string().url().optional(),
  affiliateUrl: z.string().url(),
  amenities: z.array(z.string()).default([]),
});

export type LodgingMetadata = z.infer<typeof LodgingMetadataSchema>;

// --- Hotel search API request/response ---

export const HotelSearchParamsSchema = z.object({
  city: z.string().min(1),
  country: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  guests: z.coerce.number().int().min(1).max(20).default(1),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export type HotelSearchParams = z.infer<typeof HotelSearchParamsSchema>;

export const HotelSearchResponseSchema = z.object({
  hotels: z.array(HotelResultSchema),
  city: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
});

export type HotelSearchResponse = z.infer<typeof HotelSearchResponseSchema>;
