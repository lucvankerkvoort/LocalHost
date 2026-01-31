import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

function parseDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  return new Date(value);
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const experienceId = request.nextUrl.searchParams.get('experienceId');
    if (!experienceId) {
      return NextResponse.json({ error: 'Missing experienceId' }, { status: 400 });
    }

    const experience = await prisma.experience.findUnique({
      where: { id: experienceId },
      select: { id: true, hostId: true },
    });

    if (!experience || experience.hostId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const availability = await prisma.experienceAvailability.findMany({
      where: { experienceId },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    return NextResponse.json({ availability });
  } catch (error) {
    console.error('[host/availability] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { experienceId, slots } = body as {
      experienceId?: string;
      slots?: Array<{
        date: string;
        startTime?: string | null;
        endTime?: string | null;
        spotsLeft?: number | null;
        timezone?: string | null;
      }>;
    };

    if (!experienceId || !Array.isArray(slots) || slots.length === 0) {
      return NextResponse.json({ error: 'Missing experienceId or slots' }, { status: 400 });
    }

    const experience = await prisma.experience.findUnique({
      where: { id: experienceId },
      select: { id: true, hostId: true },
    });

    if (!experience || experience.hostId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = slots.map((slot) => ({
      experienceId,
      date: parseDate(slot.date),
      startTime: slot.startTime || null,
      endTime: slot.endTime || null,
      spotsLeft: typeof slot.spotsLeft === 'number' ? slot.spotsLeft : null,
      timezone: slot.timezone || null,
    }));

    const created = await prisma.experienceAvailability.createMany({
      data,
    });

    return NextResponse.json({ created: created.count });
  } catch (error) {
    console.error('[host/availability] POST error:', error);
    return NextResponse.json({ error: 'Failed to save availability' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ids } = body as { ids?: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Missing ids' }, { status: 400 });
    }

    const deleted = await prisma.experienceAvailability.deleteMany({
      where: {
        id: { in: ids },
        experience: { hostId: session.user.id },
      },
    });

    return NextResponse.json({ deleted: deleted.count });
  } catch (error) {
    console.error('[host/availability] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete availability' }, { status: 500 });
  }
}
