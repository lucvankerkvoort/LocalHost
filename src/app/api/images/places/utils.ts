import { PLACE_IMAGE_FALLBACK } from '@/lib/images/places';

const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 400;
const MIN_DIMENSION = 200;
const MAX_DIMENSION = 1600;
const MAX_COUNT = 10;

const GENERIC_TERMS = new Set([
  'breakfast',
  'lunch',
  'dinner',
  'coffee',
  'drinks',
  'snack',
  'hotel',
  'check',
  'free',
  'time',
  'relax',
  'rest',
  'walk',
  'drive',
  'train',
  'flight',
  'arrival',
  'depart',
  'departure',
  'travel',
  'transport',
  'explore',
  'shopping',
]);

function clampDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, MIN_DIMENSION), MAX_DIMENSION);
}

export function parseDimensions(params: URLSearchParams): { width: number; height: number } {
  return {
    width: clampDimension(Number(params.get('w') ?? DEFAULT_WIDTH), DEFAULT_WIDTH),
    height: clampDimension(Number(params.get('h') ?? DEFAULT_HEIGHT), DEFAULT_HEIGHT),
  };
}

export function parseCount(params: URLSearchParams): number {
  const raw = Number(params.get('count') ?? 5);
  if (!Number.isFinite(raw)) return 5;
  return Math.min(Math.max(Math.round(raw), 1), MAX_COUNT);
}

function sanitizeQuery(value: string): string {
  const withoutParens = value.replace(/\([^)]*\)/g, ' ');
  const normalized = withoutParens
    .replace(/[-–—/\\|]+/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';

  const words = normalized.split(' ');
  return words.length > 8 ? words.slice(0, 8).join(' ') : normalized;
}

function isGenericName(name: string): boolean {
  if (!name) return true;
  const tokens = name.toLowerCase().split(' ').filter(Boolean);
  return tokens.length === 0 || tokens.every((token) => GENERIC_TERMS.has(token));
}

export function buildTextQuery(input: {
  rawQuery?: string | null;
  name?: string | null;
  description?: string | null;
  city?: string | null;
  category?: string | null;
}): string {
  const rawQuery = sanitizeQuery(input.rawQuery ?? '');
  const description = sanitizeQuery(input.description ?? '');
  if (rawQuery) {
    return [rawQuery, description].filter(Boolean).join(' ').trim();
  }

  const name = sanitizeQuery(input.name ?? '');
  const city = sanitizeQuery(input.city ?? '');
  const category = sanitizeQuery(input.category ?? '');

  if (!isGenericName(name)) {
    return [name, city, description].filter(Boolean).join(' ').trim();
  }
  if (category) {
    return [category, city, description].filter(Boolean).join(' ').trim();
  }
  if (city) return [city, description].filter(Boolean).join(' ').trim();
  return [name, category, description].filter(Boolean).join(' ').trim();
}

export function fallbackImageUrl(request: Request): string {
  return new URL(PLACE_IMAGE_FALLBACK, request.url).toString();
}
