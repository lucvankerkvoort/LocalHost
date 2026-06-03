import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const TripPreferencesPatchSchema = z.object({
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  durationDays: z.number().int().positive().nullable().optional(),
  partySize: z.number().int().positive().nullable().optional(),
  partyType: z
    .enum(['solo', 'couple', 'family_with_kids', 'family_with_elderly', 'group'])
    .nullable()
    .optional(),
  pace: z.enum(['relaxed', 'balanced', 'packed']).nullable().optional(),
  budget: z.enum(['budget', 'mid', 'premium']).nullable().optional(),
  transportMode: z.enum(['car', 'train', 'plane', 'boat']).nullable().optional(),
});

export type TripPreferencesPatch = z.infer<typeof TripPreferencesPatchSchema>;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { tripId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = TripPreferencesPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { userId: true, preferences: true } });
  if (!trip) return new NextResponse('Not Found', { status: 404 });
  if (trip.userId !== session.user.id) return new NextResponse('Forbidden', { status: 403 });

  const { startDate, endDate, durationDays, partySize, partyType, pace, budget, transportMode } = parsed.data;

  const existingPrefs = (typeof trip.preferences === 'object' && trip.preferences !== null && !Array.isArray(trip.preferences))
    ? (trip.preferences as Record<string, unknown>)
    : {};

  const prefPatch: Record<string, unknown> = {};
  if (durationDays !== undefined) prefPatch.durationDays = durationDays;
  if (partySize !== undefined) prefPatch.partySize = partySize;
  if (partyType !== undefined) prefPatch.partyType = partyType;
  if (pace !== undefined) prefPatch.pace = pace;
  if (budget !== undefined) prefPatch.budget = budget;
  if (transportMode !== undefined) prefPatch.transportMode = transportMode;

  const datePatch: { startDate?: Date | null; endDate?: Date | null } = {};
  if (startDate !== undefined) datePatch.startDate = startDate ? new Date(startDate) : null;
  if (endDate !== undefined) datePatch.endDate = endDate ? new Date(endDate) : null;

  await prisma.trip.update({
    where: { id: tripId },
    data: {
      ...datePatch,
      preferences: { ...existingPrefs, ...prefPatch },
    },
  });

  return new NextResponse(null, { status: 204 });
}
