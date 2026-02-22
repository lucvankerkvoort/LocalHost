const FROM_TO_PATTERN = /\bfrom\s+([^,]+?)\s+to\s+([^,.!?]+)\b/i;
const DATE_TOKENS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'today',
  'tomorrow',
  'yesterday',
  'day',
  'days',
  'week',
  'weeks',
  'month',
  'months',
  'year',
  'years',
  'night',
  'nights',
  'am',
  'pm',
];

export function normalizeDestinations(destinations: string[]): string[] {
  return destinations
    .map((destination) => destination.trim())
    .filter(Boolean);
}

function looksLikeDateOrQuantity(value: string): boolean {
  const lower = value.toLowerCase();
  if (/\d/.test(lower)) return true;
  if (lower.includes('$') || lower.includes('usd') || lower.includes('eur') || lower.includes('gbp')) {
    return true;
  }
  return DATE_TOKENS.some((token) => lower.includes(token));
}

export function extractFromToDestinations(message: string): string[] | null {
  const match = message.match(FROM_TO_PATTERN);
  if (!match) return null;
  const from = match[1]?.trim();
  const to = match[2]?.trim();
  if (!from || !to) return null;
  if (looksLikeDateOrQuantity(from) || looksLikeDateOrQuantity(to)) return null;
  return normalizeDestinations([from, to]);
}

const ROAD_TRIP_PATTERN = /\b(road\s*trip|roadtrip|route\s*66|scenic\s+drive|drive\s+from|driving\s+from|overland)\b/i;

export function detectRoadTripIntent(message: string): boolean {
  return ROAD_TRIP_PATTERN.test(message);
}

const TRANSPORT_KEYWORDS: Array<{ mode: 'drive' | 'train' | 'boat' | 'flight'; pattern: RegExp }> = [
  { mode: 'drive', pattern: /\b(drive|driving|car|road\s*trip|roadtrip)\b/i },
  { mode: 'train', pattern: /\b(train|rail|railway|transit)\b/i },
  { mode: 'boat', pattern: /\b(boat|ferry|ship|cruise)\b/i },
  { mode: 'flight', pattern: /\b(flight|fly|air|plane)\b/i },
];

export function detectTransportPreference(message: string): 'drive' | 'train' | 'boat' | 'flight' | null {
  for (const entry of TRANSPORT_KEYWORDS) {
    if (entry.pattern.test(message)) return entry.mode;
  }
  return null;
}
