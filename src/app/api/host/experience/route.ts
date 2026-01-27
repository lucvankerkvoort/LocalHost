import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/host/experience
 * Get the current user's published experience
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const experience = await prisma.hostExperience.findUnique({
      where: { hostId: session.user.id },
      include: {
        stops: {
          orderBy: { order: 'asc' },
        },
        host: {
          select: {
            id: true,
            name: true,
            image: true,
            city: true,
            country: true,
          },
        },
      },
    });

    return NextResponse.json({ experience });
  } catch (error) {
    console.error('[host/experience] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch experience' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/host/experience
 * Update the published experience
 */
export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, shortDesc, longDesc, duration, price, status } = body;

    const experience = await prisma.hostExperience.update({
      where: { hostId: session.user.id },
      data: {
        ...(title !== undefined && { title }),
        ...(shortDesc !== undefined && { shortDesc }),
        ...(longDesc !== undefined && { longDesc }),
        ...(duration !== undefined && { duration }),
        ...(price !== undefined && { price }),
        ...(status !== undefined && { status }),
      },
      include: {
        stops: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return NextResponse.json({ experience });
  } catch (error) {
    console.error('[host/experience] PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update experience' },
      { status: 500 }
    );
  }
}
