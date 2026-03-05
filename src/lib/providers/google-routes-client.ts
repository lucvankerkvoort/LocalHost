import {
  callExternalApi,
  type ExternalApiCallContext,
} from './external-api-gateway';

const COMPUTE_ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_FIELD_MASK = 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline';

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function resolveComputeRoutesCostMicros(): number {
  return parsePositiveInt(process.env.GOOGLE_ROUTES_COMPUTE_ROUTES_COST_MICROS, 5_000);
}

export function resolveGoogleRoutesApiKey(): string | null {
  const key =
    process.env.GOOGLE_ROUTES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

export type GoogleRoutesComputeRoutesRequest = {
  apiKey: string;
  body: Record<string, unknown>;
  fieldMask?: string;
  timeoutMs?: number;
  retries?: number;
  context?: ExternalApiCallContext;
};

export async function googleRoutesComputeRoutes(
  options: GoogleRoutesComputeRoutesRequest
): Promise<Response> {
  return callExternalApi({
    provider: 'GOOGLE_ROUTES',
    endpoint: 'routes.computeRoutes',
    url: COMPUTE_ROUTES_ENDPOINT,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': options.apiKey,
      'X-Goog-FieldMask': options.fieldMask ?? DEFAULT_FIELD_MASK,
    },
    body: JSON.stringify(options.body),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retries: options.retries ?? DEFAULT_RETRIES,
    estimatedCostMicros: resolveComputeRoutesCostMicros(),
    context: options.context,
  });
}
