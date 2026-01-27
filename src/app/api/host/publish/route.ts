import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/host/publish
 * Publish the draft as a live experience
 */
export async function POST() {
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

    // Get the draft
    const draft = await prisma.experienceDraft.findUnique({
      where: { userId: session.user.id },
      include: {
        stops: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!draft) {
      return NextResponse.json(
        { error: 'No draft found to publish' },
        { status: 404 }
      );
    }

    // Validate draft is complete
    if (!draft.city || !draft.title || !draft.shortDesc || !draft.longDesc || !draft.duration) {
      return NextResponse.json(
        { error: 'Draft is incomplete. Please fill in all required fields.' },
        { status: 400 }
      );
    }

    if (draft.stops.length === 0) {
      return NextResponse.json(
        { error: 'Experience must have at least one stop' },
        { status: 400 }
      );
    }

    // Create the published experience
    const experience = await prisma.hostExperience.create({
      data: {
        hostId: session.user.id,
        city: draft.city,
        country: draft.country || '',
        title: draft.title,
        shortDesc: draft.shortDesc,
        longDesc: draft.longDesc,
        duration: draft.duration,
        status: 'PUBLISHED',
      },
    });

    // Create stops for the published experience
    await prisma.experienceStop.createMany({
      data: draft.stops.map((stop) => ({
        experienceId: experience.id,
        name: stop.name,
        description: stop.description,
        address: stop.address,
        lat: stop.lat,
        lng: stop.lng,
        order: stop.order,
      })),
    });

    // Delete the draft
    await prisma.experienceDraft.delete({
      where: { id: draft.id },
    });

    // Mark user as a host
    await prisma.user.update({
      where: { id: session.user.id },
      data: { isHost: true },
    });

    // Fetch complete experience
    const publishedExperience = await prisma.hostExperience.findUnique({
      where: { id: experience.id },
      include: {
        stops: {
          orderBy: { order: 'asc' },
        },
        host: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    return NextResponse.json({ 
      experience: publishedExperience,
      message: 'Experience published successfully!',
    }, { status: 201 });
  } catch (error) {
    console.error('[host/publish] error:', error);
    return NextResponse.json(
      { error: 'Failed to publish experience' },
      { status: 500 }
    );
  }
}
