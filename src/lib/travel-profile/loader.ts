import { prisma } from '@/lib/prisma';
import type { TravelProfile, TravelProfileInput } from './types';

function toProfile(row: {
  id: string;
  userId: string;
  travelStyle: string;
  pace: string;
  budget: string;
  groupType: string;
  transportPreference: string | null;
  interests: string[];
  completedAt: Date | null;
}): TravelProfile {
  return {
    id: row.id,
    userId: row.userId,
    travelStyle: row.travelStyle as TravelProfile['travelStyle'],
    pace: row.pace as TravelProfile['pace'],
    budget: row.budget as TravelProfile['budget'],
    groupType: row.groupType as TravelProfile['groupType'],
    transportPreference: row.transportPreference,
    interests: row.interests,
    completedAt: row.completedAt,
  };
}

export async function loadTravelProfile(userId: string): Promise<TravelProfile | null> {
  const row = await prisma.travelProfile.findUnique({ where: { userId } });
  return row ? toProfile(row) : null;
}

export async function saveTravelProfile(
  userId: string,
  data: TravelProfileInput
): Promise<TravelProfile> {
  const row = await prisma.travelProfile.upsert({
    where: { userId },
    create: {
      userId,
      travelStyle: data.travelStyle ?? 'FLEXIBLE',
      pace: data.pace ?? 'BALANCED',
      budget: data.budget ?? 'MID',
      groupType: data.groupType ?? 'SOLO',
      transportPreference: data.transportPreference ?? null,
      interests: data.interests ?? [],
      completedAt: data.completedAt ?? new Date(),
    },
    update: {
      ...(data.travelStyle !== undefined && { travelStyle: data.travelStyle }),
      ...(data.pace !== undefined && { pace: data.pace }),
      ...(data.budget !== undefined && { budget: data.budget }),
      ...(data.groupType !== undefined && { groupType: data.groupType }),
      ...(data.transportPreference !== undefined && {
        transportPreference: data.transportPreference,
      }),
      ...(data.interests !== undefined && { interests: data.interests }),
      ...(data.completedAt !== undefined && { completedAt: data.completedAt }),
    },
  });
  return toProfile(row);
}
