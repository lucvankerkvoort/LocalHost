import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { tripId } = await params;
    
    // Verify ownership
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { stops: { include: { days: true } } }
    });

    if (!trip || trip.userId !== session.user.id) {
        return new NextResponse('Forbidden', { status: 403 });
    }

    const body = await req.json();
    console.log('[TRIP_ITEM_POST] Received:', { tripId, session_user: session?.user?.id, body });
    const { dayId, experienceId, title, type, locationName, lat, lng } = body;

    // Find the day to attach to
    // If dayId is provided, use it. If not, maybe infer from trip structure?
    // For "Add to Day", frontend should know the Day ID or Day Index.
    
    if (!dayId) {
         return new NextResponse("dayId is required", { status: 400 });
    }

    // Verify day belongs to trip
    // (Implicitly checked by finding it within trip stops? Or just trust ID + Trip ownership?)
    // Better to check.
    // Verify day belongs to trip
    const day = await prisma.itineraryDay.findFirst({
        where: {
            id: dayId,
            tripStop: {
                tripId: tripId
            }
        },
        include: { items: true }
    });

    if (!day) {
        return new NextResponse("Day not found or does not belong to this trip", { status: 404 });
    }
    
    const userId = session.user.id;

    // Calculate new order index
    const maxOrder = day.items.reduce((max, item) => Math.max(max, item.orderIndex), -1);
    const newOrder = maxOrder + 1;

    // Transaction to create item and optional booking
    const result = await prisma.$transaction(async (tx) => {
        const experience = experienceId
            ? await tx.experience.findUnique({ where: { id: experienceId } })
            : null;
        if (experienceId && !experience) {
            console.warn('[TRIP_ITEM_POST] Experience not found, creating item without experienceId:', experienceId);
        }

        const item = await tx.itineraryItem.create({
            data: {
                dayId,
                type: type || 'EXPERIENCE',
                title: title || 'New Item',
                experienceId: experience ? experience.id : null,
                locationName,
                lat,
                lng,
                orderIndex: newOrder,
                createdByAI: false,
            }
        });

        let createdBooking = null;

        // If this is an experience, create a tentative booking
        if (experience) {
            // @ts-ignore - BookingStatus enum might be stale in types
            createdBooking = await tx.booking.create({
                data: {
                    tripId,
                    experienceId: experience.id,
                    guestId: userId, 
                    itemId: item.id,
                    date: day.date || new Date(), 
                    guests: 1, 
                    totalPrice: experience.price,
                    currency: experience.currency,
                    status: 'TENTATIVE',
                    paymentStatus: 'PENDING',
                    chatUnlocked: true 
                }
            });
        }
        
        return { item, booking: createdBooking };
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('[TRIP_ITEM_POST]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}

// DELETE to remove item
export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ tripId: string }> } // This route might be /api/trips/[tripId]/items/[itemId] ? 
    // Or body? REST prefers resource URL. 
) {
    // Implementing DELETE in a separate file if using strict REST /items/[itemId]
    // Or here if passing IDs in body.
    // Let's stick to creating a separate route file for DELETE /items/[itemId] or generic /items with body.
    return new NextResponse("Use DELETE /api/trips/[tripId]/items/[itemId]", { status: 405 });
}
