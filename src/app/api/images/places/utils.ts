import { PLACE_IMAGE_FALLBACK } from '@/lib/images/places';
import { prisma } from '@/lib/prisma';

const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 400;
const MIN_DIMENSION = 200;
const MAX_DIMENSION = 1600;
const MAX_COUNT = 10;

type PlacePhoto = {
  name?: string;
  authorAttributions?: Array<{ displayName?: string; uri?: string; photoUri?: string }>;
};

type PlaceSearchResponse = {
  places?: Array<{ photos?: PlacePhoto[] }>;
};

type PhotoMediaResponse = {
  photoUri?: string;
};

export type PlaceImageAttribution = {
  displayName?: string;
  uri?: string;
};

export type PlaceImageEntry = {
  url: string;
  attribution?: PlaceImageAttribution;
};

function sanitizePhotoUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  return urls
    .filter((url): url is string => typeof url === 'string' && /^https?:\/\//.test(url))
    .slice(0, MAX_COUNT);
}

export async function getStoredActivityPhotoUrls(placeId?: string | null): Promise<string[]> {
  const normalizedPlaceId = placeId?.trim();
  if (!normalizedPlaceId) return [];

  try {
    const activity = await prisma.activity.findUnique({
      where: { externalId: normalizedPlaceId },
      select: { photos: true },
    });
    return sanitizePhotoUrls(activity?.photos);
  } catch (error) {
    console.warn('[places] failed to load cached Activity photos', error);
    return [];
  }
}

export async function persistActivityPhotoUrls(placeId: string, urls: string[]): Promise<void> {
  const normalizedPlaceId = placeId.trim();
  if (!normalizedPlaceId) return;
  const sanitized = sanitizePhotoUrls(urls);
  if (sanitized.length === 0) return;

  try {
    const activity = await prisma.activity.findUnique({
      where: { externalId: normalizedPlaceId },
      select: { id: true, photos: true },
    });
    if (!activity) return;
    if (Array.isArray(activity.photos) && activity.photos.length > 0) return;

    await prisma.activity.update({
      where: { id: activity.id },
      data: { photos: sanitized },
    });
  } catch (error) {
    console.warn('[places] failed to persist Activity photos', error);
  }
}

const GENERIC_TERMS = new Set([
  'breakfast',
  'lunch',
  'dinner',
  'coffee',
  'drinks',
  'snack',
  'hotel',
  'check in',
  'check out',
  'free time',
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

function clampDimension(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, MIN_DIMENSION), MAX_DIMENSION);
}

export function parseDimensions(params: URLSearchParams) {
  return {
    width: clampDimension(Number(params.get('w') ?? DEFAULT_WIDTH), DEFAULT_WIDTH),
    height: clampDimension(Number(params.get('h') ?? DEFAULT_HEIGHT), DEFAULT_HEIGHT),
  };
}

export function parseCount(params: URLSearchParams) {
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

function isGenericName(name: string) {
  if (!name) return true;
  const tokens = name.split(' ').filter(Boolean);
  return tokens.length === 0 || tokens.every((token) => GENERIC_TERMS.has(token));
}

export function buildTextQuery(input: {
  rawQuery?: string | null;
  name?: string | null;
  city?: string | null;
  category?: string | null;
}) {
  const rawQuery = sanitizeQuery(input.rawQuery ?? '');
  if (rawQuery) return rawQuery;

  const name = sanitizeQuery(input.name ?? '');
  const city = sanitizeQuery(input.city ?? '');
  const category = sanitizeQuery(input.category ?? '');

  if (!isGenericName(name)) {
    return [name, city].filter(Boolean).join(' ').trim();
  }
  if (category) {
    return [category, city].filter(Boolean).join(' ').trim();
  }
  if (city) return city;
  return name || category;
}

export function fallbackImageUrl(request: Request) {
  return new URL(PLACE_IMAGE_FALLBACK, request.url).toString();
}

async function fetchPlacePhotos(options: {
  textQuery: string;
  apiKey: string;
  languageCode?: string;
  regionCode?: string;
}): Promise<PlacePhoto[]> {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': options.apiKey,
      'X-Goog-FieldMask': 'places.photos',
    },
    cache: 'no-store',
    body: JSON.stringify({
      textQuery: options.textQuery,
      pageSize: 1,
      ...(options.languageCode ? { languageCode: options.languageCode } : null),
      ...(options.regionCode ? { regionCode: options.regionCode } : null),
    }),
  });

  if (!response.ok) {
    console.warn('[places] searchText failed', response.status, response.statusText);
    return [];
  }

  const payload = (await response.json()) as PlaceSearchResponse;
  const place = payload.places?.[0];
  return place?.photos ?? [];
}

async function fetchPhotoUri(options: {
  photoName: string;
  apiKey: string;
  width: number;
  height: number;
}): Promise<string | null> {
  const mediaUrl = new URL(`https://places.googleapis.com/v1/${options.photoName}/media`);
  mediaUrl.searchParams.set('maxWidthPx', String(options.width));
  mediaUrl.searchParams.set('maxHeightPx', String(options.height));
  mediaUrl.searchParams.set('skipHttpRedirect', 'true');
  mediaUrl.searchParams.set('key', options.apiKey);

  const response = await fetch(mediaUrl.toString(), { cache: 'no-store' });
  if (!response.ok) {
    console.warn('[places] photo media failed', response.status, response.statusText);
    return null;
  }

  const payload = (await response.json()) as PhotoMediaResponse;
  return payload.photoUri ?? null;
}

export async function resolvePlaceImages(options: {
  textQuery: string;
  apiKey: string;
  width: number;
  height: number;
  count: number;
  sig: number;
  languageCode?: string;
  regionCode?: string;
}): Promise<PlaceImageEntry[]> {
  const photos = await fetchPlacePhotos({
    textQuery: options.textQuery,
    apiKey: options.apiKey,
    languageCode: options.languageCode,
    regionCode: options.regionCode,
  });

  if (photos.length === 0) return [];

  const startIndex = options.sig > 0 ? options.sig % photos.length : 0;
  const selected: PlacePhoto[] = [];

  for (let i = 0; i < photos.length && selected.length < options.count; i += 1) {
    const idx = (startIndex + i) % photos.length;
    selected.push(photos[idx]);
  }

  const entries = await Promise.all(
    selected.map(async (photo): Promise<PlaceImageEntry | null> => {
      if (!photo.name) return null;
      const url = await fetchPhotoUri({
        photoName: photo.name,
        apiKey: options.apiKey,
        width: options.width,
        height: options.height,
      });
      if (!url) return null;
      const attributionSource = photo.authorAttributions?.[0];
      const entry: PlaceImageEntry = { url };

      if (attributionSource?.displayName || attributionSource?.uri) {
        entry.attribution = {
          ...(attributionSource.displayName
            ? { displayName: attributionSource.displayName }
            : null),
          ...(attributionSource.uri ? { uri: attributionSource.uri } : null),
        };
      }

      return entry;
    })
  );

  return entries.filter((entry): entry is PlaceImageEntry => entry !== null);
}
