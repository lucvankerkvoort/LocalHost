import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/itinerary/candidates/[id]
 * Get a specific candidate with full details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const candidate = await prisma.experienceCandidate.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        preliminaryChat: true,
        chatThread: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ candidate });
  } catch (error) {
    console.error('[candidates/id] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch candidate' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/itinerary/candidates/[id]
 * Update a candidate (day, time, status)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { dayNumber, date, timeSlot, status } = body;

    // Verify ownership
    const existing = await prisma.experienceCandidate.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const candidate = await prisma.experienceCandidate.update({
      where: { id },
      data: {
        ...(dayNumber !== undefined && { dayNumber }),
        ...(date !== undefined && { date: date ? new Date(date) : null }),
        ...(timeSlot !== undefined && { timeSlot }),
        ...(status !== undefined && { status }),
      },
      include: {
        preliminaryChat: true,
      },
    });

    return NextResponse.json({ candidate });
  } catch (error) {
    console.error('[candidates/id] PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update candidate' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/itinerary/candidates/[id]
 * Remove a candidate from the itinerary
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const existing = await prisma.experienceCandidate.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Soft delete - mark as cancelled
    await prisma.experienceCandidate.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[candidates/id] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete candidate' },
      { status: 500 }
    );
  }
}
