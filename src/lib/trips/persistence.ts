import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { decideTripPlanWriteAccess } from './persistence-auth';
import { supportsItineraryItemPlaceIdColumn } from './place-id-compat';
import type { TripPlanStopInput, TripPlanWritePayload } from './contracts/trip-plan.schema';
import { resolveNextTripVersion, TripVersionConflictError } from './versioning';

type PersistTripPlanBaseInput = {
  tripId: string;
  stops: TripPlanStopInput[];
  preferences?: TripPlanWritePayload['preferences'];
  title?: string;
  expectedVersion?: number;
  restoredFromVersion?: number;
  audit?: {
    source: 'api' | 'planner';
    actor: string;
    jobId?: string;
    generationId?: string;
    reason?: string;
  };
};

export class TripPlanPersistenceError extends Error {
  code: 'NOT_FOUND' | 'FORBIDDEN' | 'OWNER_MISMATCH' | 'VERSION_CONFLICT';
  status: 404 | 403 | 409;

  constructor(
    code: 'NOT_FOUND' | 'FORBIDDEN' | 'OWNER_MISMATCH' | 'VERSION_CONFLICT',
    message: string
  ) {
    super(message);
    this.name = 'TripPlanPersistenceError';
    this.code = code;
    this.status = code === 'NOT_FOUND' ? 404 : code === 'VERSION_CONFLICT' ? 409 : 403;
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
    },
  });
}

function sanitizeJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function persistTripPlanCore(
  input: PersistTripPlanBaseInput
) {
  const { tripId, stops, preferences, title, expectedVersion } = input;
  const dayIdMap: Record<number, string> = {};
  const supportsItemPlaceId = await supportsItineraryItemPlaceIdColumn(prisma);
  if (!supportsItemPlaceId) {
    logTripPlanPersistence('write.compat.placeId_disabled', { tripId });
  }

  await prisma.$transaction(async (tx) => {
    const txTrip = await tx.trip.findUnique({
      where: { id: tripId },
      select: {
        title: true,
        preferences: true,
        currentVersion: true,
      },
    });
    if (!txTrip) {
      throw new TripPlanPersistenceError('NOT_FOUND', `Trip ${tripId} not found`);
    }

    let versionInfo: { currentVersion: number; nextVersion: number };
    try {
      versionInfo = resolveNextTripVersion({
        currentVersion: txTrip.currentVersion ?? 0,
        expectedVersion,
      });
    } catch (error) {
      if (error instanceof TripVersionConflictError) {
        throw new TripPlanPersistenceError('VERSION_CONFLICT', error.message);
      }
      throw error;
    }
    const nextVersion = versionInfo.nextVersion;

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
              const baseItemData = {
                dayId: createdDay.id,
                type: item.type ?? 'SIGHT',
                title: item.title ?? 'Untitled',
                description: item.description,
                startTime: item.startTime ? new Date(item.startTime) : null,
                endTime: item.endTime ? new Date(item.endTime) : null,
                locationName: item.locationName,
                lat: item.lat,
                lng: item.lng,
                experienceId: item.experienceId?.startsWith('mock_') ? null : item.experienceId,
                hostId: item.hostId ?? null,
                orderIndex: typeof item.orderIndex === 'number' ? item.orderIndex : 0,
                createdByAI: item.createdByAI ?? true,
              };

              await tx.itineraryItem.create({
                data: supportsItemPlaceId
                  ? {
                      ...baseItemData,
                      placeId: item.placeId ?? null,
                    }
                  : baseItemData,
                select: { id: true },
              });
            }
          }
        }
      }
    }

    const existingPreferences = toRecord(txTrip.preferences);
    const nextPreferences =
      preferences && typeof preferences === 'object'
        ? { ...(existingPreferences ?? {}), ...preferences }
        : (existingPreferences ?? {});
    const nextTitle =
      typeof title === 'string' && title.trim().length > 0 ? title.trim() : txTrip.title;

    await tx.trip.update({
      where: { id: tripId },
      data: {
        ...(typeof nextTitle === 'string' && nextTitle.trim().length > 0
          ? { title: nextTitle.trim() }
          : {}),
        status: 'PLANNED',
        preferences: nextPreferences,
        currentVersion: nextVersion,
      },
    });

    const revisionPayload = sanitizeJsonValue({
      stops,
      preferences: nextPreferences,
      title: nextTitle,
    });

    await tx.tripRevision.create({
      data: {
        tripId,
        version: nextVersion,
        payload: revisionPayload,
        source: input.audit?.source ?? 'api',
        actor: input.audit?.actor ?? 'unknown',
        reason: input.audit?.reason ?? null,
        jobId: input.audit?.jobId ?? null,
        generationId: input.audit?.generationId ?? null,
        restoredFromVersion: input.restoredFromVersion ?? null,
      },
      select: { id: true },
    });
  });

  logTripPlanPersistence('write.success', {
    tripId,
    stopCount: stops.length,
    dayCount: Object.keys(dayIdMap).length,
    expectedVersion: input.expectedVersion ?? null,
    restoredFromVersion: input.restoredFromVersion ?? null,
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

  return persistTripPlanCore(input);
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

  return persistTripPlanCore({
    ...input,
    audit: {
      source: input.audit?.source ?? 'planner',
      actor: input.actor,
      jobId: input.audit?.jobId,
      generationId: input.audit?.generationId,
      reason: input.reason,
    },
  });
}
