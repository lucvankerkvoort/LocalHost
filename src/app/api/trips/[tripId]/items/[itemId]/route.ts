import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { z } from 'zod';

const PatchItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  orderIndex: z.number().int().min(0).optional(),
  type: z.enum(['SIGHT', 'EXPERIENCE', 'MEAL', 'FREE_TIME', 'TRANSPORT', 'NOTE', 'LODGING']).optional(),
});

/** Shared ownership check — returns the item if the caller owns the trip, null otherwise. */
async function verifyItemOwnership(itemId: string, tripId: string, userId: string) {
  const item = await prisma.itineraryItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      day: {
        select: {
          tripAnchor: {
            select: {
              trip: { select: { id: true, userId: true } },
            },
          },
        },
      },
    },
  });
  if (
    !item ||
    item.day.tripAnchor.trip.id !== tripId ||
    item.day.tripAnchor.trip.userId !== userId
  ) {
    return null;
  }
  return item;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ tripId: string; itemId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });

    const { tripId, itemId } = await params;
    const owned = await verifyItemOwnership(itemId, tripId, session.user.id);
    if (!owned) return new NextResponse('Forbidden or Not Found', { status: 403 });

    const body = await req.json();
    const parsed = PatchItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 });
    }

    const updated = await prisma.itineraryItem.update({
      where: { id: itemId },
      data: {
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.orderIndex !== undefined && { orderIndex: parsed.data.orderIndex }),
        ...(parsed.data.type !== undefined && { type: parsed.data.type }),
      },
    });

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error('[TRIP_ITEM_PATCH]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}

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

    const owned = await verifyItemOwnership(itemId, tripId, session.user.id);
    if (!owned) return new NextResponse('Forbidden or Not Found', { status: 403 });

    await prisma.itineraryItem.deleteMany({ where: { id: itemId } });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[TRIP_ITEM_DELETE]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
