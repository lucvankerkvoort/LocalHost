import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBookingComSearchLink, buildBookingComHotelLink } from '../affiliate-links';

test('buildBookingComSearchLink builds a valid URL with required params', () => {
  const url = buildBookingComSearchLink({
    city: 'Paris',
    countryCode: 'FR',
    checkIn: '2026-06-01',
    checkOut: '2026-06-05',
    adults: 2,
  });
  assert.ok(url.includes('booking.com'), 'should include booking.com domain');
  assert.ok(url.includes('checkin=2026-06-01'));
  assert.ok(url.includes('checkout=2026-06-05'));
  assert.ok(url.includes('group_adults=2'));
  assert.ok(url.includes('Paris'));
});

test('buildBookingComSearchLink includes affiliate ID when provided', () => {
  const url = buildBookingComSearchLink({
    city: 'Rome',
    countryCode: 'IT',
    checkIn: '2026-07-01',
    checkOut: '2026-07-03',
    adults: 1,
    affiliateId: 'test123',
  });
  assert.ok(url.includes('aid=test123'));
});

test('buildBookingComSearchLink omits affiliate ID when not provided and env not set', () => {
  const original = process.env.BOOKING_COM_AFFILIATE_ID;
  delete process.env.BOOKING_COM_AFFILIATE_ID;
  const url = buildBookingComSearchLink({
    city: 'Tokyo',
    countryCode: 'JP',
    checkIn: '2026-09-01',
    checkOut: '2026-09-04',
    adults: 1,
  });
  assert.ok(!url.includes('aid='));
  if (original !== undefined) process.env.BOOKING_COM_AFFILIATE_ID = original;
});

test('buildBookingComHotelLink builds a hotel-specific URL', () => {
  const url = buildBookingComHotelLink({
    hotelName: 'Le Marais Palace',
    countryCode: 'FR',
    checkIn: '2026-06-01',
    checkOut: '2026-06-03',
    adults: 2,
  });
  assert.ok(url.includes('booking.com/hotel/fr/le-marais-palace'));
  assert.ok(url.includes('checkin=2026-06-01'));
});

test('buildBookingComHotelLink falls back to city search for empty hotel name', () => {
  const url = buildBookingComHotelLink({
    hotelName: '',
    countryCode: 'ES',
    checkIn: '2026-08-01',
    checkOut: '2026-08-05',
    adults: 1,
  });
  assert.ok(url.includes('searchresults.html'));
});

test('buildBookingComHotelLink strips diacritics in slug', () => {
  const url = buildBookingComHotelLink({
    hotelName: 'Hôtel Étoile',
    countryCode: 'FR',
    checkIn: '2026-10-01',
    checkOut: '2026-10-03',
    adults: 1,
  });
  assert.ok(url.includes('hotel-etoile'), `slug should strip diacritics, got: ${url}`);
  assert.ok(!url.includes('ô'));
  assert.ok(!url.includes('É'));
});
