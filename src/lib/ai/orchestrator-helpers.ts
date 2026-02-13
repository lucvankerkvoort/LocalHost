import type { GeoPoint } from './types';

export function resolveDayCity(input: {
  dayCity: string;
  mainCity: string;
  anchorCity?: string | null;
}): { dayCity: string; isMainCity: boolean } {
  const resolvedCity = (input.anchorCity ?? input.dayCity).trim();
  const isMainCity =
    resolvedCity.trim().toLowerCase() === input.mainCity.trim().toLowerCase();
  return { dayCity: resolvedCity, isMainCity };
}

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
]);

const US_STATE_NAMES = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
  'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
  'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
  'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
  'new hampshire', 'new jersey', 'new mexico', 'new york',
  'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon',
  'pennsylvania', 'rhode island', 'south carolina', 'south dakota',
  'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
  'west virginia', 'wisconsin', 'wyoming', 'district of columbia',
]);

const ISO_COUNTRY_CODES = new Set([
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ',
  'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ',
  'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
  'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET',
  'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
  'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY',
  'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
  'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
  'JE', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ',
  'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
  'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
  'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ',
  'OM',
  'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
  'QA',
  'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ',
  'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
  'UA', 'UG', 'UM', 'US', 'UY', 'UZ',
  'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU',
  'WF', 'WS',
  'YE', 'YT',
  'ZA', 'ZM', 'ZW',
]);

const COUNTRY_HINTS = new Set([
  'united states', 'usa', 'us', 'u.s.', 'u.s.a.', 'america',
  'united kingdom', 'uk', 'u.k.', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland',
  'canada', 'mexico', 'france', 'italy', 'spain', 'germany', 'austria', 'switzerland',
  'netherlands', 'belgium', 'luxembourg', 'portugal', 'ireland', 'poland', 'czechia', 'czech republic', 'slovakia',
  'hungary', 'slovenia', 'croatia', 'serbia', 'bosnia', 'bosnia and herzegovina', 'montenegro', 'albania', 'macedonia',
  'greece', 'turkey', 'romania', 'bulgaria', 'ukraine', 'russia', 'latvia', 'lithuania', 'estonia',
  'denmark', 'sweden', 'norway', 'finland', 'iceland',
  'japan', 'china', 'india', 'south korea', 'north korea', 'taiwan', 'hong kong', 'singapore', 'thailand', 'vietnam', 'indonesia', 'philippines',
  'australia', 'new zealand',
  'brazil', 'argentina', 'chile', 'colombia', 'peru', 'uruguay', 'paraguay', 'bolivia',
  'south africa', 'nigeria', 'kenya', 'morocco', 'egypt', 'ghana', 'ethiopia',
  'uae', 'united arab emirates', 'qatar', 'saudi arabia', 'israel', 'jordan', 'lebanon',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isCountryToken(token: string): boolean {
  const upper = token.toUpperCase();
  const lower = token.toLowerCase();
  return ISO_COUNTRY_CODES.has(upper) || COUNTRY_HINTS.has(lower);
}

function looksLikeCityName(candidate: string): boolean {
  const cleaned = candidate.trim();
  if (!cleaned) return false;
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return false;
  return tokens.every((token) => /^[A-Z][a-zA-Z'.-]*$/.test(token));
}

function isStateToken(token: string): boolean {
  const upper = token.toUpperCase();
  const lower = token.toLowerCase();
  return US_STATE_CODES.has(upper) || US_STATE_NAMES.has(lower);
}

function hasCountryHint(input: string, dayCountry?: string): boolean {
  const normalized = input.toLowerCase();
  for (const hint of COUNTRY_HINTS) {
    const pattern = new RegExp(`\\b${escapeRegExp(hint)}\\b`, 'i');
    if (pattern.test(normalized)) return true;
  }

  const normalizedCountry = dayCountry?.trim().toLowerCase();
  const isUnitedStates = Boolean(
    normalizedCountry &&
      (normalizedCountry === 'united states' ||
        normalizedCountry === 'usa' ||
        normalizedCountry === 'us' ||
        normalizedCountry === 'u.s.' ||
        normalizedCountry === 'u.s.a.')
  );

  const codeMatches = input.match(/\b[A-Z]{2}\b/g);
  if (codeMatches) {
    for (const code of codeMatches) {
      if (isUnitedStates && US_STATE_CODES.has(code)) continue;
      if (ISO_COUNTRY_CODES.has(code)) return true;
    }
  }

  return false;
}

function isExplicitLocationCandidate(candidate: string): boolean {
  const parts = candidate
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    const token = parts[0] || candidate.trim();
    return Boolean(token) && (isCountryToken(token) || isStateToken(token) || looksLikeCityName(token));
  }

  const tail = parts[parts.length - 1];
  if (isCountryToken(tail) || isStateToken(tail) || looksLikeCityName(tail)) return true;

  if (parts.length >= 2) {
    const lastTwo = parts.slice(-2);
    if (lastTwo.some((part) => isCountryToken(part) || isStateToken(part) || looksLikeCityName(part))) {
      return true;
    }
  }

  return false;
}

export function extractExplicitLocationHint(input: string): {
  placeName: string;
  locationHint: string | null;
} {
  const trimmed = input.trim();
  if (!trimmed) return { placeName: trimmed, locationHint: null };

  const parenMatch = trimmed.match(/\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const candidate = parenMatch[1].trim();
    if (isExplicitLocationCandidate(candidate)) {
      const placeName = trimmed.replace(/\s*\([^)]+\)\s*$/, '').trim();
      const shouldAttachPlace =
        !candidate.includes(',') &&
        (isCountryToken(candidate) || isStateToken(candidate));
      const locationHint = shouldAttachPlace ? `${placeName}, ${candidate}`.trim() : candidate;
      return { placeName: placeName || trimmed, locationHint };
    }
  }

  const dashSplit = trimmed.split(/\s[–—-]\s/);
  if (dashSplit.length > 1) {
    const candidate = dashSplit[dashSplit.length - 1].trim();
    if (isExplicitLocationCandidate(candidate)) {
      const placeName = dashSplit.slice(0, -1).join(' - ').trim();
      return { placeName: placeName || trimmed, locationHint: candidate };
    }
  }

  const inMatch = trimmed.match(/^(.*)\s+(?:in|near|around|outside(?: of)?|at)\s+(.+)$/i);
  if (inMatch) {
    const placeName = inMatch[1].trim();
    const locationHint = inMatch[2].trim();
    if (placeName && locationHint) {
      return { placeName, locationHint };
    }
  }

  const commaParts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    const tail = commaParts[commaParts.length - 1];
    if (isCountryToken(tail) || isStateToken(tail)) {
      const candidate = commaParts.slice(-2).join(', ');
      if (isExplicitLocationCandidate(candidate)) {
        const placeName = commaParts.slice(0, -2).join(', ').trim();
        return { placeName: placeName || commaParts[0], locationHint: candidate };
      }
    } else if (looksLikeCityName(tail)) {
      const placeName = commaParts.slice(0, -1).join(', ').trim();
      return { placeName: placeName || commaParts[0], locationHint: tail };
    }
  }

  if (isExplicitLocationCandidate(trimmed)) {
    return { placeName: trimmed, locationHint: trimmed };
  }

  return { placeName: trimmed, locationHint: null };
}

export function resolveExplicitLocationContext(input: {
  locationHint: string;
  dayCountry: string;
}): string {
  const location = input.locationHint.trim();
  const country = input.dayCountry.trim();
  if (!country) return location;

  if (hasCountryHint(location, country)) return location;

  return `${location}, ${country}`;
}

export function resolveActivityAnchor(input: {
  dayAnchor: GeoPoint | null;
  tripAnchor: GeoPoint | null;
  isMainCity: boolean;
}): GeoPoint | null {
  if (input.dayAnchor) return input.dayAnchor;
  return input.isMainCity ? input.tripAnchor : null;
}

export function resolveActivityContext(input: {
  dayCity: string;
  dayCountry: string;
}): string {
  const city = input.dayCity.trim();
  const country = input.dayCountry.trim();
  if (!city) return country;
  if (!country) return city;
  return `${city}, ${country}`;
}
