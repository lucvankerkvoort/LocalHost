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

    if (!experience) {
      // Check if it's a HostExperience that wasn't synced to Experience table
      const hostExperience = await prisma.hostExperience.findUnique({
        where: { id: experienceId },
        select: { id: true, hostId: true },
      });

      if (hostExperience) {
        // HostExperience exists but Experience doesn't - needs sync/republish
        if (hostExperience.hostId !== session.user.id) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        return NextResponse.json({ 
          error: 'Experience needs to be republished to enable availability',
          code: 'REPUBLISH_REQUIRED'
        }, { status: 409 });
      }

      // Check if it's a draft
      const draft = await prisma.experienceDraft.findUnique({
        where: { id: experienceId },
        select: { id: true, userId: true },
      });

      if (draft) {
        if (draft.userId !== session.user.id) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        return NextResponse.json({ 
          error: 'Publish your experience first to manage availability',
          code: 'PUBLISH_REQUIRED'
        }, { status: 409 });
      }

      // Nothing found
      return NextResponse.json({ error: 'Experience not found' }, { status: 404 });
    }

    if (experience.hostId !== session.user.id) {
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
    
    // Support both new dates[] format and legacy slots[] format
    const { experienceId, dates, spotsLeft, timezone, slots } = body as {
      experienceId?: string;
      dates?: string[];
      spotsLeft?: number | null;
      timezone?: string | null;
      slots?: Array<{ date: string; spotsLeft?: number | null; timezone?: string | null }>;
    };

    // Normalize to dates array
    let dateStrings: string[] = [];
    let slotSpotsLeft = spotsLeft;
    let slotTimezone = timezone;

    if (dates && Array.isArray(dates) && dates.length > 0) {
      dateStrings = dates;
    } else if (slots && Array.isArray(slots) && slots.length > 0) {
      // Legacy support: extract dates from slots
      dateStrings = slots.map(s => s.date);
      slotSpotsLeft = slotSpotsLeft ?? slots[0]?.spotsLeft;
      slotTimezone = slotTimezone ?? slots[0]?.timezone;
    }

    if (!experienceId || dateStrings.length === 0) {
      return NextResponse.json({ error: 'Missing experienceId or dates' }, { status: 400 });
    }

    const experience = await prisma.experience.findUnique({
      where: { id: experienceId },
      select: { id: true, hostId: true },
    });

    if (!experience || experience.hostId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse dates to UTC midnight
    const parsedDates = dateStrings.map(d => parseDate(d));

    // Check for existing records (idempotency)
    const existing = await prisma.experienceAvailability.findMany({
      where: {
        experienceId,
        date: { in: parsedDates },
      },
      select: { date: true },
    });

    const existingDates = new Set(existing.map(e => e.date.toISOString()));

    // Filter out duplicates
    const newDates = parsedDates.filter(d => !existingDates.has(d.toISOString()));

    let createdCount = 0;
    if (newDates.length > 0) {
      const data = newDates.map((date) => ({
        experienceId,
        date,
        startTime: null, // Date-only: always null
        endTime: null,   // Date-only: always null
        spotsLeft: typeof slotSpotsLeft === 'number' ? slotSpotsLeft : null,
        timezone: slotTimezone || null,
      }));

      const created = await prisma.experienceAvailability.createMany({
        data,
      });
      createdCount = created.count;
    }

    return NextResponse.json({ 
      created: createdCount, 
      skipped: parsedDates.length - newDates.length 
    });
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
