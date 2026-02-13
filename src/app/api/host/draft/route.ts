import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type DraftStopInput = {
  name: string;
  description?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
};

/**
 * GET /api/host/draft
 * Get current user's experience draft
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const drafts = await prisma.experienceDraft.findMany({
      where: { userId: session.user.id },
      include: {
        stops: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ drafts });
  } catch (error) {
    console.error('[host/draft] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch draft' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/host/draft
 * Create or update experience draft
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user already has a published experience
    const existingExperience = await prisma.hostExperience.findUnique({
      where: { hostId: session.user.id },
    });

    if (existingExperience) {
      return NextResponse.json(
        { error: 'You already have a published experience. MVP allows only one experience per host.' },
        { status: 409 }
      );
    }

    const body = await request.json();
    const { id, city, country, title, shortDesc, longDesc, duration, stops, status } = body;

    let draft;

    if (id) {
       // Update existing
       const existing = await prisma.experienceDraft.findUnique({ where: { id }});
       if (!existing || existing.userId !== session.user.id) {
         return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
       }
       draft = await prisma.experienceDraft.update({
         where: { id },
         data: {
           city, country, title, shortDesc, longDesc, duration, status
         },
         include: { stops: { orderBy: { order: 'asc' } } }
       });
    } else {
       // Create new
       draft = await prisma.experienceDraft.create({
         data: {
           userId: session.user.id,
           city, country, title, shortDesc, longDesc, duration, status: status || 'IN_PROGRESS'
         },
         include: { stops: true }
       });
    }

    // Handle stops if provided
    if (stops && Array.isArray(stops)) {
      // Delete existing stops
      await prisma.experienceStop.deleteMany({
        where: { draftId: draft.id },
      });

      // Create new stops
      if (stops.length > 0) {
        await prisma.experienceStop.createMany({
          data: stops.map((stop: DraftStopInput, index: number) => ({
            draftId: draft.id,
            name: stop.name,
            description: stop.description || null,
            address: stop.address || null,
            lat: stop.lat || null,
            lng: stop.lng || null,
            order: index,
          })),
        });
      }

      // Refetch with updated stops
      const updatedDraft = await prisma.experienceDraft.findUnique({
        where: { id: draft.id },
        include: {
          stops: {
            orderBy: { order: 'asc' },
          },
        },
      });

      return NextResponse.json({ draft: updatedDraft });
    }

    return NextResponse.json({ draft });
  } catch (error) {
    console.error('[host/draft] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to save draft' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/host/draft
 * Delete the current draft
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Draft ID required' }, { status: 400 });
    }

    const draft = await prisma.experienceDraft.findUnique({ where: { id }});
    if (!draft || draft.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.experienceDraft.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[host/draft] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete draft' },
      { status: 500 }
    );
  }
}
