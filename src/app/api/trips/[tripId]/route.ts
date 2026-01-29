import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function GET(
    req: Request,
    { params }: { params: { tripId: string } }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { tripId } = await params;

        const trip = await prisma.trip.findUnique({
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
                                    include: {
                                        experience: true // Include experience details if needed
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

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
