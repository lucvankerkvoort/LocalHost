import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { supportsItineraryItemPlaceIdColumn } from '@/lib/trips/place-id-compat';

const ITINERARY_ITEM_SELECT = {
    id: true,
    type: true,
    title: true,
    description: true,
    locationName: true,
    lat: true,
    lng: true,
    orderIndex: true,
    experienceId: true,
    hostId: true,
    experience: {
        select: {
            hostId: true,
        },
    },
    bookings: {
        orderBy: { updatedAt: 'desc' as const },
        select: {
            id: true,
            status: true,
            paymentStatus: true,
            updatedAt: true,
        }
    }
};

const ITINERARY_ITEM_SELECT_WITH_PLACE_ID = {
    ...ITINERARY_ITEM_SELECT,
    placeId: true,
};

async function fetchTripWithCompatibility(tripId: string) {
    const supportsItemPlaceId = await supportsItineraryItemPlaceIdColumn(prisma);
    return prisma.trip.findUnique({
        where: { id: tripId },
        include: {
            stops: {
                orderBy: { order: 'asc' },
                include: {
                    days: {
                        orderBy: { dayIndex: 'asc' },
                        include: {
                            items: {
                                orderBy: { orderIndex: 'asc' },
                                select: supportsItemPlaceId
                                    ? ITINERARY_ITEM_SELECT_WITH_PLACE_ID
                                    : ITINERARY_ITEM_SELECT,
                            }
                        }
                    }
                }
            }
        }
    });
}

export async function GET(
    req: Request,
    { params }: { params: Promise<{ tripId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { tripId } = await params;

        const trip = await fetchTripWithCompatibility(tripId);

        if (!trip) {
            return new NextResponse('Not Found', { status: 404 });
        }

        if (trip.userId !== session.user.id) {
             return new NextResponse('Forbidden', { status: 403 });
        }

        return NextResponse.json(trip);

    } catch (error) {
        console.error('[TRIP_GET]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ tripId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { tripId } = await params;

        const trip = await prisma.trip.findUnique({
            where: { id: tripId },
        });

        if (!trip) {
            return new NextResponse('Not Found', { status: 404 });
        }

        if (trip.userId !== session.user.id) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        await prisma.trip.delete({
            where: { id: tripId },
        });

        return new NextResponse(null, { status: 204 });

    } catch (error) {
        console.error('[TRIP_DELETE]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}
