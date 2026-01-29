import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth'; // Assuming auth helper is available

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
    return new NextResponse('Internal Error', { status: 500 });
  }
}
