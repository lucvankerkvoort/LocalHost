import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ tripId: string; itemId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { tripId, itemId } = await params;

    // Verify ownership via nested relation
    const item = await prisma.itineraryItem.findUnique({
        where: { id: itemId },
        select: {
            id: true,
            day: {
                select: {
                    tripAnchor: {
                        select: {
                            trip: {
                                select: {
                                    id: true,
                                    userId: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!item || item.day.tripAnchor.trip.id !== tripId || item.day.tripAnchor.trip.userId !== session.user.id) {
         return new NextResponse('Forbidden or Not Found', { status: 403 });
    }

    await prisma.itineraryItem.deleteMany({
        where: { id: itemId }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[TRIP_ITEM_DELETE]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
