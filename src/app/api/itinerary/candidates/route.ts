import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/itinerary/candidates
 * Get all experience candidates for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dayNumber = searchParams.get('dayNumber');
    const tripId = searchParams.get('tripId');

    const candidates = await prisma.experienceCandidate.findMany({
      where: {
        userId: session.user.id,
        ...(dayNumber && { dayNumber: parseInt(dayNumber, 10) }),
        ...(tripId && { tripId }),
      },
      include: {
        preliminaryChat: true,
        chatThread: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1, // Just get last message for preview
            },
          },
        },
      },
      orderBy: [
        { dayNumber: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    return NextResponse.json({ candidates });
  } catch (error) {
    console.error('[candidates] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch candidates' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/itinerary/candidates
 * Add an experience to an itinerary day
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { hostId, experienceId, dayNumber, date, timeSlot, tripId } = body;

    if (!hostId || !experienceId || !dayNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: hostId, experienceId, dayNumber' },
        { status: 400 }
      );
    }

    // Check if already added to this day
    const existing = await prisma.experienceCandidate.findFirst({
      where: {
        userId: session.user.id,
        hostId,
        experienceId,
        dayNumber,
        tripId: tripId || null,
        status: { not: 'CANCELLED' },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Experience already added to this day' },
        { status: 409 }
      );
    }

    const candidate = await prisma.experienceCandidate.create({
      data: {
        userId: session.user.id,
        hostId,
        experienceId,
        dayNumber,
        date: date ? new Date(date) : null,
        timeSlot,
        tripId,
        status: 'INTERESTED',
      },
      include: {
        preliminaryChat: true,
      },
    });

    return NextResponse.json({ candidate }, { status: 201 });
  } catch (error) {
    console.error('[candidates] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to add candidate' },
      { status: 500 }
    );
  }
}
