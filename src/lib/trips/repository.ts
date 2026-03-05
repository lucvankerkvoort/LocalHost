import { supportsItineraryItemPlaceIdColumn } from './place-id-compat';
import {
  TripPlanWritePayloadSchema,
  type TripPlanStopInput,
  type TripPlanWritePayload,
} from './contracts/trip-plan.schema';

export type PlannerTripSeedSnapshot = {
  destinationTitles: string[];
  hasPersistedItineraryDays: boolean;
};

export type TripPlanItemSnapshot = {
  type: 'SIGHT' | 'EXPERIENCE' | 'MEAL' | 'FREE_TIME' | 'TRANSPORT' | 'NOTE' | 'LODGING';
  title: string;
  description: string | null;
  startTime: Date | null;
  endTime: Date | null;
  locationName: string | null;
  placeId?: string | null;
  lat: number | null;
  lng: number | null;
  experienceId: string | null;
  hostId: string | null;
  createdByAI: boolean;
};

export type TripPlanDaySnapshot = {
  dayIndex: number;
  date: Date | null;
  title: string | null;
  suggestedHosts: unknown[];
  items: TripPlanItemSnapshot[];
};

export type TripPlanStopSnapshot = {
  title: string;
  type: 'CITY' | 'REGION' | 'ROAD_TRIP' | 'TRAIL';
  locations: Array<{
    name: string;
    lat: number;
    lng: number;
    placeId?: string;
  }>;
  days: TripPlanDaySnapshot[];
};

type TripSummaryRecord = {
  id: string;
  title: string;
  status: string;
  currentVersion: number;
};

export type TripPlanSnapshot = {
  trip: TripSummaryRecord;
  stops: TripPlanStopSnapshot[];
};

type SaveTripPlanForUserAudit = {
  source: 'api' | 'planner';
  actor: string;
  jobId?: string;
  generationId?: string;
  reason?: string;
};

type SaveTripPlanPayloadForUserInput = {
  userId: string;
  tripId: string;
  stops: TripPlanStopInput[];
  preferences?: TripPlanWritePayload['preferences'];
  title?: string;
  expectedVersion?: number;
  restoredFromVersion?: number;
  audit?: SaveTripPlanForUserAudit;
};

type SaveTripPlanSnapshotForUserInput = Omit<SaveTripPlanPayloadForUserInput, 'stops'> & {
  stops: TripPlanStopSnapshot[];
};

export type TripRevisionSummary = {
  id: string;
  version: number;
  source: string;
  actor: string;
  reason: string | null;
  jobId: string | null;
  generationId: string | null;
  restoredFromVersion: number | null;
  createdAt: Date;
};

export type TripRevisionListSnapshot = {
  tripId: string;
  currentVersion: number;
  revisions: TripRevisionSummary[];
};

type TripAnchorSnapshotRecord = {
  title: string;
  type: TripPlanStopSnapshot['type'];
  locations: unknown;
  days: Array<{
    dayIndex: number;
    date: Date | null;
    title: string | null;
    suggestedHosts: unknown;
    items: Array<{
      type: TripPlanItemSnapshot['type'];
      title: string;
      description: string | null;
      startTime: Date | null;
      endTime: Date | null;
      locationName: string | null;
      placeId?: string | null;
      lat: number | null;
      lng: number | null;
      experienceId: string | null;
      hostId: string | null;
      createdByAI: boolean;
    }>;
  }>;
};

async function getPrismaClient() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

function normalizeLocationArray(
  stop: Pick<TripPlanStopInput, 'locations' | 'city' | 'lat' | 'lng' | 'placeId'>
): NonNullable<TripPlanStopInput['locations']> {
  if (Array.isArray(stop.locations) && stop.locations.length > 0) {
    return stop.locations;
  }
  return [
    {
      name: stop.city ?? 'Unknown',
      lat: stop.lat ?? 0,
      lng: stop.lng ?? 0,
      ...(stop.placeId ? { placeId: stop.placeId } : {}),
    },
  ];
}

function toIsoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function coerceLocations(
  value: unknown
): Array<{ name: string; lat: number; lng: number; placeId?: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const candidate = entry as {
        name?: unknown;
        lat?: unknown;
        lng?: unknown;
        placeId?: unknown;
      };
      if (
        typeof candidate.name !== 'string' ||
        typeof candidate.lat !== 'number' ||
        typeof candidate.lng !== 'number'
      ) {
        return null;
      }
      return {
        name: candidate.name,
        lat: candidate.lat,
        lng: candidate.lng,
        placeId: typeof candidate.placeId === 'string' ? candidate.placeId : undefined,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

function coerceSuggestedHosts(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function mapTripPlanStopsToInputPayload(stops: TripPlanStopSnapshot[]): TripPlanStopInput[] {
  return stops.map((stop, stopIndex) => {
    const normalizedLocations = normalizeLocationArray({
      locations: stop.locations,
      city: stop.title,
      lat: stop.locations[0]?.lat,
      lng: stop.locations[0]?.lng,
      placeId: stop.locations[0]?.placeId,
    });

    return {
      title: stop.title,
      type: stop.type,
      order: stopIndex,
      locations: normalizedLocations,
      days: stop.days.map((day) => ({
        dayIndex: day.dayIndex,
        date: toIsoOrNull(day.date),
        title: day.title,
        suggestedHosts: day.suggestedHosts,
        items: day.items.map((item, itemIndex) => ({
          type: item.type,
          title: item.title,
          description: item.description,
          startTime: toIsoOrNull(item.startTime),
          endTime: toIsoOrNull(item.endTime),
          locationName: item.locationName,
          placeId: item.placeId ?? null,
          lat: item.lat ?? undefined,
          lng: item.lng ?? undefined,
          experienceId: item.experienceId,
          hostId: item.hostId,
          orderIndex: itemIndex,
          createdByAI: item.createdByAI,
        })),
      })),
    };
  });
}

export async function getPlannerTripSeedForUser(
  userId: string,
  tripId: string
): Promise<PlannerTripSeedSnapshot | null> {
  const prisma = await getPrismaClient();
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      userId,
    },
    select: {
      id: true,
    },
  });

  if (!trip) return null;

  const tripAnchors = await prisma.tripAnchor.findMany({
    where: { tripId: trip.id },
    orderBy: { order: 'asc' },
    select: { title: true },
  });

  const destinationTitles = tripAnchors
    .map((stop) => stop.title)
    .filter((title): title is string => typeof title === 'string' && title.trim().length > 0);

  const persistedItineraryDayCount = await prisma.itineraryDay.count({
    where: {
      tripAnchor: {
        tripId: trip.id,
      },
    },
  });

  return {
    destinationTitles,
    hasPersistedItineraryDays: persistedItineraryDayCount > 0,
  };
}

export async function loadTripPlanSnapshotForUser(
  userId: string,
  tripId: string
): Promise<TripPlanSnapshot | null> {
  const prisma = await getPrismaClient();
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      userId,
    },
    select: {
      id: true,
      title: true,
      status: true,
      currentVersion: true,
    },
  });
  if (!trip) return null;

  const supportsItemPlaceId = await supportsItineraryItemPlaceIdColumn(prisma);

  const tripAnchors = (await prisma.tripAnchor.findMany({
    where: { tripId: trip.id },
    orderBy: { order: 'asc' },
    include: {
      days: {
        orderBy: { dayIndex: 'asc' },
        include: {
          items: {
            orderBy: { orderIndex: 'asc' },
            select: supportsItemPlaceId
              ? {
                  type: true,
                  title: true,
                  description: true,
                  startTime: true,
                  endTime: true,
                  locationName: true,
                  placeId: true,
                  lat: true,
                  lng: true,
                  experienceId: true,
                  hostId: true,
                  createdByAI: true,
                }
              : {
                  type: true,
                  title: true,
                  description: true,
                  startTime: true,
                  endTime: true,
                  locationName: true,
                  lat: true,
                  lng: true,
                  experienceId: true,
                  hostId: true,
                  createdByAI: true,
                },
          },
        },
      },
    },
  })) as unknown as TripAnchorSnapshotRecord[];

  return {
    trip: {
      id: trip.id,
      title: trip.title,
      status: trip.status,
      currentVersion: trip.currentVersion,
    },
    stops: tripAnchors.map((stop) => {
      const locations = coerceLocations(stop.locations);
      return {
        title: stop.title,
        type: stop.type,
        locations:
          locations.length > 0
            ? locations
            : [{ name: stop.title, lat: 0, lng: 0 }],
        days: stop.days.map((day) => ({
          dayIndex: day.dayIndex,
          date: day.date,
          title: day.title,
          suggestedHosts: coerceSuggestedHosts(day.suggestedHosts),
          items: day.items.map((item) => ({
            type: item.type as TripPlanItemSnapshot['type'],
            title: item.title,
            description: item.description,
            startTime: item.startTime,
            endTime: item.endTime,
            locationName: item.locationName,
            placeId:
              'placeId' in item && typeof item.placeId === 'string' ? item.placeId : null,
            lat: item.lat,
            lng: item.lng,
            experienceId: item.experienceId,
            hostId: item.hostId,
            createdByAI: item.createdByAI,
          })),
        })),
      } satisfies TripPlanStopSnapshot;
    }),
  };
}

export async function getTripCurrentVersionForUser(
  userId: string,
  tripId: string
): Promise<number | null> {
  const prisma = await getPrismaClient();
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      userId,
    },
    select: {
      currentVersion: true,
    },
  });
  return trip ? trip.currentVersion : null;
}

export async function listTripRevisionsForUser(
  userId: string,
  tripId: string
): Promise<TripRevisionListSnapshot | null> {
  const prisma = await getPrismaClient();
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      userId,
    },
    select: {
      id: true,
      currentVersion: true,
    },
  });
  if (!trip) return null;

  const revisions = await prisma.tripRevision.findMany({
    where: { tripId: trip.id },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      version: true,
      source: true,
      actor: true,
      reason: true,
      jobId: true,
      generationId: true,
      restoredFromVersion: true,
      createdAt: true,
    },
  });

  return {
    tripId: trip.id,
    currentVersion: trip.currentVersion,
    revisions,
  };
}

export async function restoreTripRevisionForUser(input: {
  userId: string;
  tripId: string;
  revisionId: string;
  expectedVersion?: number;
  actor: string;
  reason?: string;
}): Promise<{ restoredVersion: number; restoredFromVersion: number }> {
  const prisma = await getPrismaClient();
  const trip = await prisma.trip.findFirst({
    where: {
      id: input.tripId,
      userId: input.userId,
    },
    select: {
      id: true,
      currentVersion: true,
    },
  });
  if (!trip) {
    throw new Error(`Trip ${input.tripId} not found or access denied.`);
  }

  const revision = await prisma.tripRevision.findFirst({
    where: {
      id: input.revisionId,
      tripId: trip.id,
    },
    select: {
      version: true,
      payload: true,
    },
  });
  if (!revision) {
    throw new Error(`Revision ${input.revisionId} not found for trip ${trip.id}.`);
  }

  const parsed = TripPlanWritePayloadSchema.safeParse(revision.payload);
  if (!parsed.success) {
    throw new Error(
      `Stored revision payload is invalid for revision ${input.revisionId}.`
    );
  }

  await saveTripPlanPayloadForUser({
    userId: input.userId,
    tripId: trip.id,
    ...parsed.data,
    expectedVersion: input.expectedVersion,
    restoredFromVersion: revision.version,
    audit: {
      source: 'api',
      actor: input.actor,
      reason: input.reason ?? 'restore_trip_revision',
    },
  });

  const updatedVersion = await getTripCurrentVersionForUser(input.userId, trip.id);
  if (updatedVersion === null) {
    throw new Error(`Unable to load updated trip version for ${trip.id}.`);
  }

  return {
    restoredVersion: updatedVersion,
    restoredFromVersion: revision.version,
  };
}

export async function saveTripPlanPayloadForUser(input: SaveTripPlanPayloadForUserInput) {
  const { persistTripPlanAsUser } = await import('./persistence');
  return persistTripPlanAsUser({
    tripId: input.tripId,
    userId: input.userId,
    stops: input.stops,
    preferences: input.preferences,
    title: input.title,
    expectedVersion: input.expectedVersion,
    restoredFromVersion: input.restoredFromVersion,
    audit: input.audit,
  });
}

export async function saveTripPlanSnapshotForUser(input: SaveTripPlanSnapshotForUserInput) {
  return saveTripPlanPayloadForUser({
    ...input,
    stops: mapTripPlanStopsToInputPayload(input.stops),
  });
}
