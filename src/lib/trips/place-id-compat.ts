type PrismaLikeError = {
  code?: unknown;
  message?: unknown;
};

type PrismaLikeQueryClient = {
  $queryRawUnsafe: <T = unknown>(query: string) => Promise<T>;
};

let cachedItineraryItemPlaceIdSupport: boolean | null = null;

/**
 * Prisma Accelerate sometimes hides the exact missing column in P2022 errors.
 * We treat generic unknown-column P2022 as a signal to retry without `placeId`.
 */
export function isMissingPlaceIdColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as PrismaLikeError;
  if (candidate.code !== 'P2022') return false;
  if (typeof candidate.message !== 'string') return false;

  const message = candidate.message.toLowerCase();
  return (
    message.includes('placeid') ||
    message.includes('column `(not available)` does not exist')
  );
}

/**
 * Detect schema drift where Prisma expects `ItineraryItem.placeId` but DB has not been migrated yet.
 * Cached per process to avoid repeated information_schema lookups.
 */
export async function supportsItineraryItemPlaceIdColumn(
  client: PrismaLikeQueryClient
): Promise<boolean> {
  if (cachedItineraryItemPlaceIdSupport !== null) {
    return cachedItineraryItemPlaceIdSupport;
  }

  try {
    const rows = await client.$queryRawUnsafe<Array<{ column_name: string }>>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ItineraryItem'
    `);
    cachedItineraryItemPlaceIdSupport = Array.isArray(rows)
      ? rows.some((row) => row.column_name === 'placeId')
      : true;
  } catch {
    // If detection fails, prefer normal behavior over blocking writes.
    cachedItineraryItemPlaceIdSupport = true;
  }

  return cachedItineraryItemPlaceIdSupport;
}

export function resetPlaceIdCompatibilityCacheForTests(): void {
  cachedItineraryItemPlaceIdSupport = null;
}
