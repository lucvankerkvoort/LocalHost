import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

type DraftWithStops = Prisma.ExperienceDraftGetPayload<{
  include: { stops: true };
}>;

/**
 * POST /api/host/publish
 * Publish the draft as a live experience
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { draftId } = await request.json();
    if (!draftId) {
      return NextResponse.json({ error: 'Draft ID required' }, { status: 400 });
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
    const draft = (await prisma.experienceDraft.findUnique({
      where: { id: draftId },
      include: {
        stops: {
          orderBy: { order: 'asc' },
        },
      },
    })) as DraftWithStops | null;

    if (!draft || draft.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Draft not found or unauthorized' },
        { status: 404 }
      );
    }

    // Validate draft is complete
    const missingFields = [];
    if (!draft.city) missingFields.push('City');
    if (!draft.title) missingFields.push('Title');
    if (!draft.shortDesc) missingFields.push('Short Description');
    if (!draft.longDesc) missingFields.push('Full Description');
    if (!draft.duration) missingFields.push('Duration');

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Draft is incomplete. Missing: ${missingFields.join(', ')}` },
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
        city: draft.city!,
        country: draft.country || '',
        title: draft.title!,
        shortDesc: draft.shortDesc!,
        longDesc: draft.longDesc!,
        duration: draft.duration!,
        status: 'PUBLISHED',
      },
    });

    // Create matching Experience row (marketplace record) with the SAME ID
    // This allows /api/host/availability and booking flows to find the experience
    await prisma.experience.create({
      data: {
        id: experience.id, // Use same ID as HostExperience
        hostId: session.user.id,
        title: draft.title!,
        description: draft.longDesc!,
        category: 'ARTS_CULTURE', // Default category for MVP
        neighborhood: draft.city!, // Use city as neighborhood default
        city: draft.city!,
        country: draft.country || 'Unknown',
        duration: draft.duration!,
        minGroupSize: 1,
        maxGroupSize: 6,
        price: draft.price || 5000, // Default price in cents
        currency: draft.currency || 'USD',
        includedItems: [],
        excludedItems: [],
        photos: [],
        rating: 0,
        reviewCount: 0,
        isActive: true,
        latitude: draft.cityLat || null,
        longitude: draft.cityLng || null,
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
