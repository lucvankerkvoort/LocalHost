/**
 * Booking.com affiliate deep link generator
 *
 * Pure functions — no external calls, no side effects.
 * Affiliate ID is read from BOOKING_COM_AFFILIATE_ID env var.
 * Links work without an affiliate ID but won't track commissions.
 */

const BOOKING_COM_BASE = 'https://www.booking.com';

function resolveAffiliateId(override?: string): string | undefined {
  return override ?? (process.env.BOOKING_COM_AFFILIATE_ID?.trim() || undefined);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type BookingComSearchParams = {
  city: string;
  countryCode: string; // ISO 2-letter, e.g. "FR"
  checkIn: string;    // YYYY-MM-DD
  checkOut: string;   // YYYY-MM-DD
  adults: number;
  affiliateId?: string;
};

/**
 * Build a Booking.com city search URL.
 * Used when no specific hotel ID is available.
 */
export function buildBookingComSearchLink(params: BookingComSearchParams): string {
  const url = new URL(`${BOOKING_COM_BASE}/searchresults.html`);
  url.searchParams.set('ss', `${params.city}, ${params.countryCode}`);
  url.searchParams.set('checkin', params.checkIn);
  url.searchParams.set('checkout', params.checkOut);
  url.searchParams.set('group_adults', String(params.adults));
  url.searchParams.set('no_rooms', '1');
  url.searchParams.set('selected_currency', 'USD');

  const affiliateId = resolveAffiliateId(params.affiliateId);
  if (affiliateId) {
    url.searchParams.set('aid', affiliateId);
  }

  return url.toString();
}

export type BookingComHotelParams = {
  hotelName: string;
  countryCode: string; // ISO 2-letter
  checkIn: string;    // YYYY-MM-DD
  checkOut: string;   // YYYY-MM-DD
  adults: number;
  affiliateId?: string;
};

/**
 * Build a Booking.com hotel-specific URL.
 * Falls back to a city search if the name can't be slugified.
 */
export function buildBookingComHotelLink(params: BookingComHotelParams): string {
  const hotelSlug = slugify(params.hotelName);
  if (!hotelSlug) {
    return buildBookingComSearchLink({
      city: params.hotelName,
      countryCode: params.countryCode,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      adults: params.adults,
      affiliateId: params.affiliateId,
    });
  }

  const countrySlug = params.countryCode.toLowerCase();
  const url = new URL(`${BOOKING_COM_BASE}/hotel/${countrySlug}/${hotelSlug}.html`);
  url.searchParams.set('checkin', params.checkIn);
  url.searchParams.set('checkout', params.checkOut);
  url.searchParams.set('group_adults', String(params.adults));
  url.searchParams.set('no_rooms', '1');
  url.searchParams.set('selected_currency', 'USD');

  const affiliateId = resolveAffiliateId(params.affiliateId);
  if (affiliateId) {
    url.searchParams.set('aid', affiliateId);
  }

  return url.toString();
}
