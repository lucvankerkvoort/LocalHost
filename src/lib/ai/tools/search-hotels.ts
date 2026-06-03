import { z } from 'zod';
import { createTool, type ToolResult } from './tool-registry';
import { searchHotels, cityToIataCode } from '@/lib/providers/amadeus-hotels-client';
import { buildBookingComSearchLink } from '@/lib/hotels/affiliate-links';
import type { HotelResult } from '@/types/hotels';

// ============================================================================
// Schema
// ============================================================================

const SearchHotelsParams = z.object({
  city: z.string().describe('City name, e.g. "Paris"'),
  country: z.string().describe('Country name or ISO code, e.g. "France" or "FR"'),
  checkIn: z.string().describe('Check-in date in YYYY-MM-DD format'),
  checkOut: z.string().describe('Check-out date in YYYY-MM-DD format'),
  guests: z.number().int().min(1).max(20).default(1).describe('Number of adult guests'),
  limit: z.number().int().min(1).max(5).default(3).describe('Maximum number of hotels to return'),
});

// ============================================================================
// Tool definition
// ============================================================================

export const searchHotelsTool = createTool({
  name: 'search_hotels',
  description:
    'Search for hotel accommodations in a specific city for a date range. ' +
    'Use this when a trip spans multiple nights and the user needs accommodation. ' +
    'Returns the top hotels with affiliate booking links to Booking.com. ' +
    'Do NOT call this for day trips or when the user already has accommodation.',
  parameters: SearchHotelsParams,

  async handler(params): Promise<ToolResult<HotelResult[]>> {
    const { city, country, checkIn, checkOut, guests, limit } = params;

    // Validate dates
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (
      isNaN(checkInDate.getTime()) ||
      isNaN(checkOutDate.getTime()) ||
      checkOutDate <= checkInDate
    ) {
      return {
        success: false,
        error: 'Invalid date range: checkOut must be after checkIn',
        code: 'INVALID_DATES',
      };
    }

    const cityCode = cityToIataCode(city);

    if (!cityCode) {
      // City not in IATA map — return a single affiliate fallback result
      const affiliateUrl = buildBookingComSearchLink({
        city,
        countryCode: country.slice(0, 2).toUpperCase(),
        checkIn,
        checkOut,
        adults: guests,
      });
      const fallback: HotelResult = {
        hotelId: `fallback-${city.toLowerCase().replace(/\s+/g, '-')}`,
        name: `Hotels in ${city}`,
        lat: 0,
        lng: 0,
        city,
        country,
        currency: 'USD',
        amenities: [],
        affiliateUrl,
      };
      return { success: true, data: [fallback] };
    }

    const hotels = await searchHotels({
      cityCode,
      city,
      country,
      checkIn,
      checkOut,
      guests,
      limit,
    });

    if (hotels.length === 0) {
      // No Amadeus results (e.g., no credentials or no availability) — return affiliate fallback
      const affiliateUrl = buildBookingComSearchLink({
        city,
        countryCode: country.slice(0, 2).toUpperCase(),
        checkIn,
        checkOut,
        adults: guests,
      });
      return {
        success: true,
        data: [
          {
            hotelId: `fallback-${city.toLowerCase().replace(/\s+/g, '-')}`,
            name: `Hotels in ${city}`,
            lat: 0,
            lng: 0,
            city,
            country,
            currency: 'USD',
            amenities: [],
            affiliateUrl,
          },
        ],
      };
    }

    return { success: true, data: hotels };
  },
});
