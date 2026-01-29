import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function DELETE(
  req: Request,
  { params }: { params: { tripId: string; itemId: string } }
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
        include: {
            day: {
                include: {
                    tripStop: {
                        include: {
                            trip: true
                        }
                    }
                }
            }
        }
    });

    if (!item || item.day.tripStop.trip.id !== tripId || item.day.tripStop.trip.userId !== session.user.id) {
         return new NextResponse('Forbidden or Not Found', { status: 403 });
    }

    await prisma.itineraryItem.delete({
        where: { id: itemId }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[TRIP_ITEM_DELETE]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
