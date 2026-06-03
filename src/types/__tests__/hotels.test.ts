import assert from 'node:assert/strict';
import test from 'node:test';

import { LodgingMetadataSchema, HotelResultSchema, HotelSearchParamsSchema } from '../hotels';

const validLodging = {
  provider: 'booking_com' as const,
  hotelName: 'Grand Hotel Paris',
  stars: 4,
  pricePerNightCents: 25000,
  currency: 'USD',
  checkIn: '2026-06-01',
  checkOut: '2026-06-05',
  nights: 4,
  guests: 2,
  affiliateUrl: 'https://www.booking.com/searchresults.html?ss=Paris%2C+FR',
  amenities: ['WiFi', 'Pool'],
};

test('LodgingMetadataSchema accepts a valid payload', () => {
  const result = LodgingMetadataSchema.safeParse(validLodging);
  assert.equal(result.success, true);
});

test('LodgingMetadataSchema rejects invalid date format', () => {
  const result = LodgingMetadataSchema.safeParse({ ...validLodging, checkIn: '01-06-2026' });
  assert.equal(result.success, false);
});

test('LodgingMetadataSchema rejects provider other than booking_com', () => {
  const result = LodgingMetadataSchema.safeParse({ ...validLodging, provider: 'expedia' });
  assert.equal(result.success, false);
});

test('LodgingMetadataSchema rejects stars outside 1-5', () => {
  const result = LodgingMetadataSchema.safeParse({ ...validLodging, stars: 6 });
  assert.equal(result.success, false);
});

test('LodgingMetadataSchema defaults amenities to empty array when omitted', () => {
  const { amenities: _, ...withoutAmenities } = validLodging;
  const result = LodgingMetadataSchema.safeParse(withoutAmenities);
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.amenities, []);
  }
});

test('LodgingMetadataSchema defaults guests to 1 when omitted', () => {
  const { guests: _, ...withoutGuests } = validLodging;
  const result = LodgingMetadataSchema.safeParse(withoutGuests);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.guests, 1);
  }
});

test('HotelResultSchema accepts a minimal valid result', () => {
  const result = HotelResultSchema.safeParse({
    hotelId: 'HOTEL123',
    name: 'Test Hotel',
    lat: 48.8566,
    lng: 2.3522,
    city: 'Paris',
    country: 'France',
    affiliateUrl: 'https://www.booking.com/searchresults.html?ss=Paris%2C+FR',
  });
  assert.equal(result.success, true);
});

test('HotelResultSchema rejects missing affiliateUrl', () => {
  const result = HotelResultSchema.safeParse({
    hotelId: 'HOTEL123',
    name: 'Test Hotel',
    lat: 48.8566,
    lng: 2.3522,
    city: 'Paris',
    country: 'France',
  });
  assert.equal(result.success, false);
});

test('HotelSearchParamsSchema coerces string guests to number', () => {
  const result = HotelSearchParamsSchema.safeParse({
    city: 'Paris',
    country: 'France',
    checkIn: '2026-06-01',
    checkOut: '2026-06-05',
    guests: '2',
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.guests, 2);
  }
});

test('HotelSearchParamsSchema rejects invalid date format', () => {
  const result = HotelSearchParamsSchema.safeParse({
    city: 'Paris',
    country: 'France',
    checkIn: 'June 1 2026',
    checkOut: '2026-06-05',
  });
  assert.equal(result.success, false);
});
