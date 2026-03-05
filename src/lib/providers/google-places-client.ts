import {
  callExternalApi,
  type ExternalApiCallContext,
} from './external-api-gateway';

const SEARCH_TEXT_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 2;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function resolveSearchTextCostMicros(): number {
  return parsePositiveInt(process.env.GOOGLE_PLACES_SEARCH_TEXT_COST_MICROS, 17_000);
}

function resolvePhotoMediaCostMicros(): number {
  return parsePositiveInt(process.env.GOOGLE_PLACES_PHOTO_MEDIA_COST_MICROS, 7_000);
}

export function resolveGooglePlacesApiKey(): string | null {
  const key =
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

export type GooglePlacesSearchTextRequest = {
  apiKey: string;
  body: Record<string, unknown>;
  fieldMask: string;
  timeoutMs?: number;
  retries?: number;
  context?: ExternalApiCallContext;
};

export async function googlePlacesSearchText(
  options: GooglePlacesSearchTextRequest
): Promise<Response> {
  return callExternalApi({
    provider: 'GOOGLE_PLACES',
    endpoint: 'places.searchText',
    url: SEARCH_TEXT_ENDPOINT,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': options.apiKey,
      'X-Goog-FieldMask': options.fieldMask,
    },
    body: JSON.stringify(options.body),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retries: options.retries ?? DEFAULT_RETRIES,
    estimatedCostMicros: resolveSearchTextCostMicros(),
    context: options.context,
  });
}

export type GooglePlacesPhotoMediaRequest = {
  apiKey: string;
  photoName: string;
  width: number;
  height: number;
  timeoutMs?: number;
  retries?: number;
  context?: ExternalApiCallContext;
};

export async function googlePlacesPhotoMedia(
  options: GooglePlacesPhotoMediaRequest
): Promise<Response> {
  const mediaUrl = new URL(`https://places.googleapis.com/v1/${options.photoName}/media`);
  mediaUrl.searchParams.set('maxWidthPx', String(options.width));
  mediaUrl.searchParams.set('maxHeightPx', String(options.height));
  mediaUrl.searchParams.set('skipHttpRedirect', 'true');
  mediaUrl.searchParams.set('key', options.apiKey);

  return callExternalApi({
    provider: 'GOOGLE_PLACES',
    endpoint: 'places.photoMedia',
    url: mediaUrl.toString(),
    method: 'GET',
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retries: options.retries ?? DEFAULT_RETRIES,
    estimatedCostMicros: resolvePhotoMediaCostMicros(),
    context: options.context,
  });
}
