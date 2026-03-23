export type PartyType =
  | 'solo'
  | 'couple'
  | 'family_with_kids'
  | 'family_with_elderly'
  | 'group';

export type AccommodationStyle =
  | 'hotel_in_town'
  | 'house_outside_town'
  | 'campsite'
  | 'hostel'
  | 'mixed';

export type TripBudget = 'budget' | 'mid' | 'premium';
export type TripPace = 'relaxed' | 'balanced' | 'packed';

export type TripPreferences = {
  partyType: PartyType | 'waived' | null;
  partySize: number | 'waived' | null;
  accommodationStyle: AccommodationStyle | 'waived' | null;
  pace: TripPace | 'waived' | null;
  budget: TripBudget | 'waived' | null;
  foodPreferences: string[] | 'waived' | null;
};

export type TripPreferenceField = keyof TripPreferences;

export const REQUIRED_PREFERENCE_FIELDS: TripPreferenceField[] = ['partyType', 'partySize'];

export const OPTIONAL_PREFERENCE_FIELDS: TripPreferenceField[] = [
  'accommodationStyle',
  'pace',
  'budget',
  'foodPreferences',
];

export const ALL_PREFERENCE_FIELDS: TripPreferenceField[] = [
  ...REQUIRED_PREFERENCE_FIELDS,
  ...OPTIONAL_PREFERENCE_FIELDS,
];

export const DEFAULT_TRIP_PREFERENCES: TripPreferences = {
  partyType: null,
  partySize: null,
  accommodationStyle: null,
  pace: null,
  budget: null,
  foodPreferences: null,
};

export function isTripPreferencesComplete(prefs: TripPreferences): boolean {
  return ALL_PREFERENCE_FIELDS.every((field) => prefs[field] !== null);
}

export function getMissingRequiredFields(prefs: TripPreferences): TripPreferenceField[] {
  return REQUIRED_PREFERENCE_FIELDS.filter((field) => prefs[field] === null);
}

export function getMissingOptionalFields(prefs: TripPreferences): TripPreferenceField[] {
  return OPTIONAL_PREFERENCE_FIELDS.filter((field) => prefs[field] === null);
}

/** Resolved preferences with "waived" replaced by sensible defaults for generation. */
export type ResolvedPreferences = {
  partyType: PartyType | null;
  partySize: number | null;
  accommodationStyle: AccommodationStyle | null;
  pace: TripPace | null;
  budget: TripBudget | null;
  foodPreferences: string[] | null;
};

export function applyPreferenceDefaults(prefs: TripPreferences): ResolvedPreferences {
  return {
    partyType: prefs.partyType === 'waived' ? null : prefs.partyType,
    partySize: prefs.partySize === 'waived' ? null : prefs.partySize,
    accommodationStyle: prefs.accommodationStyle === 'waived' ? 'mixed' : prefs.accommodationStyle,
    pace: prefs.pace === 'waived' ? 'balanced' : prefs.pace,
    budget: prefs.budget === 'waived' ? 'mid' : prefs.budget,
    foodPreferences: prefs.foodPreferences === 'waived' ? [] : prefs.foodPreferences,
  };
}

/** Format preferences for injection into the planner directive each turn. */
export function formatPreferencesForDirective(prefs: TripPreferences): string {
  const missing = getMissingRequiredFields(prefs);
  const lines = ALL_PREFERENCE_FIELDS.map((field) => {
    const val = prefs[field];
    if (val === null) {
      const isRequired = REQUIRED_PREFERENCE_FIELDS.includes(field);
      return `- ${field}: null ← ${isRequired ? 'REQUIRED' : 'optional'}, not yet collected`;
    }
    if (val === 'waived') return `- ${field}: waived`;
    if (Array.isArray(val)) return `- ${field}: ${val.length > 0 ? val.join(', ') : 'none (waived)'}`;
    return `- ${field}: ${val}`;
  });

  const gateStatus =
    missing.length === 0
      ? 'generateItinerary is UNBLOCKED — all required preferences collected.'
      : `generateItinerary is BLOCKED — required fields still null: ${missing.join(', ')}.`;

  return `Trip preferences:\n${lines.join('\n')}\n${gateStatus}`;
}

const PARTY_TYPES: PartyType[] = [
  'solo',
  'couple',
  'family_with_kids',
  'family_with_elderly',
  'group',
];
const ACCOMMODATION_STYLES: AccommodationStyle[] = [
  'hotel_in_town',
  'house_outside_town',
  'campsite',
  'hostel',
  'mixed',
];
const BUDGETS: TripBudget[] = ['budget', 'mid', 'premium'];
const PACES: TripPace[] = ['relaxed', 'balanced', 'packed'];

function validateEnum<T extends string>(value: unknown, valid: T[]): T | 'waived' | null {
  if (value === 'waived') return 'waived';
  if (typeof value === 'string' && valid.includes(value as T)) return value as T;
  return null;
}

/** Safely parse an unknown JSON value (from DB) into TripPreferences. */
export function parseTripPreferences(raw: unknown): TripPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_TRIP_PREFERENCES };
  }
  const obj = raw as Record<string, unknown>;
  return {
    partyType: validateEnum(obj.partyType, PARTY_TYPES),
    partySize:
      typeof obj.partySize === 'number'
        ? obj.partySize
        : obj.partySize === 'waived'
          ? 'waived'
          : null,
    accommodationStyle: validateEnum(obj.accommodationStyle, ACCOMMODATION_STYLES),
    pace: validateEnum(obj.pace, PACES),
    budget: validateEnum(obj.budget, BUDGETS),
    foodPreferences: Array.isArray(obj.foodPreferences)
      ? (obj.foodPreferences as string[]).filter((v) => typeof v === 'string')
      : obj.foodPreferences === 'waived'
        ? 'waived'
        : null,
  };
}
