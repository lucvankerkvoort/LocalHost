import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth'; 

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const trips = await prisma.trip.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        _count: {
          select: { stops: true, bookings: true },
        },
      },
    });

    return NextResponse.json({ trips });
  } catch (error) {
    console.error('[TRIPS_GET]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Verify user exists in DB to prevent Foreign Key errors with stale sessions
    const userExists = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true }
    });

    if (!userExists) {
        console.warn(`[TRIPS_POST] User ID ${session.user.id} from session not found in DB. Stale session?`);
        return new NextResponse('User not found. Please sign out and sign in again.', { status: 401 });
    }

    const body = await req.json();
    const { title, startDate, endDate, preferences } = body;

    if (!title) {
        return new NextResponse("Title is required", { status: 400 });
    }

    const trip = await prisma.trip.create({
      data: {
        userId: session.user.id,
        title,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        preferences: preferences || {},
        status: 'DRAFT',
      },
    });

    return NextResponse.json(trip);
  } catch (error) {
    console.error('[TRIPS_POST]', error);
    return new NextResponse(`Internal Error: ${error instanceof Error ? error.message : 'Unknown'}`, { status: 500 });
  }
}
