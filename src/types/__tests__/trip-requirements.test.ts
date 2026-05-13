import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TripRequirementsSchema,
  PartialTripRequirementsSchema,
  firstMissingField,
  requirementsAreComplete,
  formatRequirementsForPrompt,
  type TripRequirements,
  type PartialTripRequirements,
} from '../trip-requirements';

// ---------------------------------------------------------------------------
// TripRequirementsSchema — full validation
// ---------------------------------------------------------------------------

test('TripRequirementsSchema accepts a complete valid payload', () => {
  const valid: TripRequirements = {
    destination: { city: 'Tokyo', country: 'Japan' },
    durationDays: 7,
    startDate: '2026-06-01',
    travelStyle: 'cultural',
    groupSize: 2,
    groupComposition: 'couple',
  };
  const result = TripRequirementsSchema.safeParse(valid);
  assert.equal(result.success, true);
});

test('TripRequirementsSchema rejects invalid startDate format', () => {
  const invalid = {
    destination: { city: 'Tokyo', country: 'Japan' },
    durationDays: 7,
    startDate: '01-06-2026', // wrong format
    travelStyle: 'cultural',
    groupSize: 2,
    groupComposition: 'couple',
  };
  const result = TripRequirementsSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test('TripRequirementsSchema rejects unknown travelStyle', () => {
  const invalid = {
    destination: { city: 'Paris', country: 'France' },
    durationDays: 5,
    startDate: '2026-07-10',
    travelStyle: 'party', // not in enum
    groupSize: 3,
    groupComposition: 'friends',
  };
  const result = TripRequirementsSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test('TripRequirementsSchema accepts optional enrichment fields', () => {
  const rich: TripRequirements = {
    destination: { city: 'Mexico City', country: 'Mexico' },
    durationDays: 10,
    startDate: '2026-03-15',
    travelStyle: 'foodie',
    groupSize: 1,
    groupComposition: 'solo',
    budget: 'budget',
    interests: ['street food', 'murals'],
    dietaryRestrictions: ['vegetarian'],
    mobilityNeeds: 'full',
  };
  const result = TripRequirementsSchema.safeParse(rich);
  assert.equal(result.success, true);
});

test('TripRequirementsSchema accepts region for US destinations', () => {
  const us: TripRequirements = {
    destination: { city: 'Moab', country: 'United States', region: 'Utah' },
    durationDays: 4,
    startDate: '2026-09-01',
    travelStyle: 'adventure',
    groupSize: 4,
    groupComposition: 'friends',
  };
  const result = TripRequirementsSchema.safeParse(us);
  assert.equal(result.success, true);
});

// ---------------------------------------------------------------------------
// PartialTripRequirementsSchema
// ---------------------------------------------------------------------------

test('PartialTripRequirementsSchema accepts an empty object', () => {
  const result = PartialTripRequirementsSchema.safeParse({});
  assert.equal(result.success, true);
});

test('PartialTripRequirementsSchema accepts a partial destination', () => {
  const result = PartialTripRequirementsSchema.safeParse({
    destination: { city: 'Amsterdam' }, // missing country
  });
  assert.equal(result.success, true);
});

// ---------------------------------------------------------------------------
// firstMissingField
// ---------------------------------------------------------------------------

test('firstMissingField returns destination on empty requirements', () => {
  const missing = firstMissingField({});
  assert.equal(missing, 'destination');
});

test('firstMissingField returns destination when only city present', () => {
  const partial: PartialTripRequirements = { destination: { city: 'Berlin' } };
  assert.equal(firstMissingField(partial), 'destination');
});

test('firstMissingField returns durationDays after destination is set', () => {
  const partial: PartialTripRequirements = {
    destination: { city: 'Berlin', country: 'Germany' },
  };
  assert.equal(firstMissingField(partial), 'durationDays');
});

test('firstMissingField returns startDate after duration is set', () => {
  const partial: PartialTripRequirements = {
    destination: { city: 'Berlin', country: 'Germany' },
    durationDays: 5,
  };
  assert.equal(firstMissingField(partial), 'startDate');
});

test('firstMissingField returns null when all required fields present', () => {
  const complete: PartialTripRequirements = {
    destination: { city: 'Tokyo', country: 'Japan' },
    durationDays: 7,
    startDate: '2026-06-01',
    travelStyle: 'cultural',
    groupSize: 2,
    groupComposition: 'couple',
  };
  assert.equal(firstMissingField(complete), null);
});

// ---------------------------------------------------------------------------
// requirementsAreComplete
// ---------------------------------------------------------------------------

test('requirementsAreComplete returns false for empty object', () => {
  assert.equal(requirementsAreComplete({}), false);
});

test('requirementsAreComplete returns true when all required fields present', () => {
  const complete: PartialTripRequirements = {
    destination: { city: 'Lisbon', country: 'Portugal' },
    durationDays: 4,
    startDate: '2026-08-20',
    travelStyle: 'relaxation',
    groupSize: 2,
    groupComposition: 'couple',
  };
  assert.equal(requirementsAreComplete(complete), true);
});

// ---------------------------------------------------------------------------
// formatRequirementsForPrompt
// ---------------------------------------------------------------------------

test('formatRequirementsForPrompt includes all required fields', () => {
  const r: TripRequirements = {
    destination: { city: 'Tokyo', country: 'Japan' },
    durationDays: 5,
    startDate: '2026-06-10',
    travelStyle: 'foodie',
    groupSize: 2,
    groupComposition: 'couple',
  };
  const text = formatRequirementsForPrompt(r);
  assert.ok(text.includes('Tokyo'));
  assert.ok(text.includes('Japan'));
  assert.ok(text.includes('5 days'));
  assert.ok(text.includes('2026-06-10'));
  assert.ok(text.includes('foodie'));
  assert.ok(text.includes('couple'));
});

test('formatRequirementsForPrompt includes region when set', () => {
  const r: TripRequirements = {
    destination: { city: 'Moab', country: 'United States', region: 'Utah' },
    durationDays: 3,
    startDate: '2026-05-01',
    travelStyle: 'adventure',
    groupSize: 1,
    groupComposition: 'solo',
  };
  const text = formatRequirementsForPrompt(r);
  assert.ok(text.includes('Utah'));
});

test('formatRequirementsForPrompt includes mobility warning when limited', () => {
  const r: TripRequirements = {
    destination: { city: 'Rome', country: 'Italy' },
    durationDays: 6,
    startDate: '2026-10-01',
    travelStyle: 'cultural',
    groupSize: 2,
    groupComposition: 'couple',
    mobilityNeeds: 'limited',
  };
  const text = formatRequirementsForPrompt(r);
  assert.ok(text.includes('limited'));
});

test('formatRequirementsForPrompt omits optional lines when not set', () => {
  const r: TripRequirements = {
    destination: { city: 'Seoul', country: 'South Korea' },
    durationDays: 7,
    startDate: '2026-11-15',
    travelStyle: 'cultural',
    groupSize: 3,
    groupComposition: 'friends',
  };
  const text = formatRequirementsForPrompt(r);
  assert.ok(!text.includes('budget'));
  assert.ok(!text.includes('dietary'));
  assert.ok(!text.includes('limited'));
});
