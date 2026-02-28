import { prisma } from '@/lib/prisma';
import { decideTripPlanWriteAccess } from './persistence-auth';

type TripPlanLocationPayload = {
  name?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
};

type TripAnchorType = 'CITY' | 'REGION' | 'ROAD_TRIP' | 'TRAIL';
type TripItineraryItemType =
  | 'SIGHT'
  | 'EXPERIENCE'
  | 'MEAL'
  | 'FREE_TIME'
  | 'TRANSPORT'
  | 'NOTE'
  | 'LODGING';

type TripPlanItemPayload = {
  type?: TripItineraryItemType;
  title?: string | null;
  description?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  locationName?: string | null;
  placeId?: string | null;
  lat?: number;
  lng?: number;
  experienceId?: string | null;
  orderIndex?: number;
  createdByAI?: boolean;
};

type TripPlanDayPayload = {
  dayIndex: number;
  date?: string | null;
  title?: string | null;
  suggestedHosts?: unknown[];
  items?: TripPlanItemPayload[];
};

type TripPlanStopPayload = {
  title?: string;
  city?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  type?: TripAnchorType;
  order?: number;
  locations?: TripPlanLocationPayload[];
  days?: TripPlanDayPayload[];
};

type PersistTripPlanBaseInput = {
  tripId: string;
  stops: TripPlanStopPayload[];
  preferences?: Record<string, unknown> | null;
  title?: string;
  audit?: {
    source: 'api' | 'planner';
    actor: string;
    jobId?: string;
    generationId?: string;
    reason?: string;
  };
};

export class TripPlanPersistenceError extends Error {
  code: 'NOT_FOUND' | 'FORBIDDEN' | 'OWNER_MISMATCH';
  status: 404 | 403;

  constructor(code: 'NOT_FOUND' | 'FORBIDDEN' | 'OWNER_MISMATCH', message: string) {
    super(message);
    this.name = 'TripPlanPersistenceError';
    this.code = code;
    this.status = code === 'NOT_FOUND' ? 404 : 403;
  }
}

function logTripPlanPersistence(event: string, payload: Record<string, unknown>) {
  console.info(`[trip-persistence] ${event}`, payload);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function getTripForWrite(tripId: string) {
  return prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      userId: true,
      preferences: true,
    },
  });
}

async function persistTripPlanCore(
  trip: { id: string; userId: string; preferences: unknown },
  input: PersistTripPlanBaseInput
) {
  const { tripId, stops, preferences, title } = input;
  const dayIdMap: Record<number, string> = {};

  await prisma.$transaction(async (tx) => {
    await tx.tripAnchor.deleteMany({
      where: { tripId },
    });

    for (const [stopIndex, stop] of stops.entries()) {
      const locationArray = stop.locations || [
        {
          name: stop.city || 'Unknown',
          lat: stop.lat || 0,
          lng: stop.lng || 0,
          placeId: stop.placeId,
        },
      ];

      const createdAnchor = await tx.tripAnchor.create({
        data: {
          tripId,
          title: stop.title || stop.city || 'Stop',
          type: stop.type || 'CITY',
          locations: locationArray,
          order: typeof stop.order === 'number' ? stop.order : stopIndex,
        },
      });

      if (stop.days && Array.isArray(stop.days)) {
        for (const day of stop.days) {
          const createdDay = await tx.itineraryDay.create({
            data: {
              tripAnchorId: createdAnchor.id,
              dayIndex: day.dayIndex,
              date: day.date ? new Date(day.date) : null,
              title: day.title,
              suggestedHosts: day.suggestedHosts ?? [],
            },
          });

          dayIdMap[day.dayIndex] = createdDay.id;

          if (day.items && Array.isArray(day.items)) {
            for (const item of day.items) {
              await tx.itineraryItem.create({
                data: {
                  dayId: createdDay.id,
                  type: item.type ?? 'SIGHT',
                  title: item.title ?? 'Untitled',
                  description: item.description,
                  startTime: item.startTime ? new Date(item.startTime) : null,
                  endTime: item.endTime ? new Date(item.endTime) : null,
                  locationName: item.locationName,
                  placeId: item.placeId ?? null,
                  lat: item.lat,
                  lng: item.lng,
                  experienceId: item.experienceId,
                  orderIndex: typeof item.orderIndex === 'number' ? item.orderIndex : 0,
                  createdByAI: item.createdByAI ?? true,
                },
              });
            }
          }
        }
      }
    }

    const existingPreferences = toRecord(trip.preferences);
    const nextPreferences =
      preferences && typeof preferences === 'object'
        ? { ...(existingPreferences ?? {}), ...preferences }
        : (existingPreferences ?? {});

    await tx.trip.update({
      where: { id: tripId },
      data: {
        ...(typeof title === 'string' && title.trim().length > 0 ? { title: title.trim() } : {}),
        status: 'PLANNED',
        preferences: nextPreferences,
      },
    });
  });

  logTripPlanPersistence('write.success', {
    tripId,
    stopCount: stops.length,
    dayCount: Object.keys(dayIdMap).length,
    source: input.audit?.source ?? null,
    actor: input.audit?.actor ?? null,
    jobId: input.audit?.jobId ?? null,
    generationId: input.audit?.generationId ?? null,
    reason: input.audit?.reason ?? null,
  });

  return dayIdMap;
}

export async function persistTripPlanAsUser(
  input: PersistTripPlanBaseInput & {
    userId: string;
  }
) {
  const trip = await getTripForWrite(input.tripId);
  const decision = decideTripPlanWriteAccess({
    mode: 'user',
    tripExists: Boolean(trip),
    tripOwnerUserId: trip?.userId ?? null,
    userId: input.userId,
  });

  if (!decision.allowed) {
    logTripPlanPersistence('write.rejected', {
      tripId: input.tripId,
      mode: 'user',
      userId: input.userId,
      reason: decision.reason,
      source: input.audit?.source ?? null,
      actor: input.audit?.actor ?? null,
      jobId: input.audit?.jobId ?? null,
      generationId: input.audit?.generationId ?? null,
    });
    if (decision.reason === 'not_found') {
      throw new TripPlanPersistenceError('NOT_FOUND', `Trip ${input.tripId} not found`);
    }
    throw new TripPlanPersistenceError('FORBIDDEN', `Trip ${input.tripId} does not belong to user ${input.userId}`);
  }

  return persistTripPlanCore(
    {
      id: trip!.id,
      userId: trip!.userId,
      preferences: trip!.preferences,
    },
    input
  );
}

export async function persistTripPlanInternal(
  input: PersistTripPlanBaseInput & {
    actor: string;
    reason: string;
    expectedTripOwnerUserId?: string | null;
  }
) {
  const trip = await getTripForWrite(input.tripId);
  const decision = decideTripPlanWriteAccess({
    mode: 'internal',
    tripExists: Boolean(trip),
    tripOwnerUserId: trip?.userId ?? null,
    expectedTripOwnerUserId: input.expectedTripOwnerUserId ?? null,
  });

  if (!decision.allowed) {
    logTripPlanPersistence('write.rejected', {
      tripId: input.tripId,
      mode: 'internal',
      actor: input.actor,
      reason: decision.reason,
      expectedTripOwnerUserId: input.expectedTripOwnerUserId ?? null,
      source: input.audit?.source ?? null,
      jobId: input.audit?.jobId ?? null,
      generationId: input.audit?.generationId ?? null,
    });
    if (decision.reason === 'not_found') {
      throw new TripPlanPersistenceError('NOT_FOUND', `Trip ${input.tripId} not found`);
    }
    throw new TripPlanPersistenceError(
      'OWNER_MISMATCH',
      `Trip ${input.tripId} owner mismatch for internal write actor ${input.actor}`
    );
  }

  return persistTripPlanCore(
    {
      id: trip!.id,
      userId: trip!.userId,
      preferences: trip!.preferences,
    },
    {
      ...input,
      audit: {
        source: input.audit?.source ?? 'planner',
        actor: input.actor,
        jobId: input.audit?.jobId,
        generationId: input.audit?.generationId,
        reason: input.reason,
      },
    }
  );
}
