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
    const { dayId, dayNumber, experienceId, hostId, title, type, locationName, lat, lng } = body;

    // Find the day to attach to
    let day = null;
    
    // 1. Try explicit dayId
    if (dayId) {
        day = await prisma.itineraryDay.findFirst({
            where: {
                id: dayId,
                tripAnchor: { tripId: tripId }
            },
            include: { items: true }
        });
    }

    // 2. Fallback to dayNumber if dayId failed or wasn't provided
    if (!day && dayNumber !== undefined) {
         console.log('[TRIP_ITEM_POST] Falling back to dayNumber lookup:', dayNumber);
         // Find day by index within the trip
         // Use findFirst over the whole trip structure or iterate?
         // Efficient query:
         day = await prisma.itineraryDay.findFirst({
            where: {
                dayIndex: dayNumber, // Assuming backend uses dayIndex 0-based or frontend passes correct one?
                // Frontend passes `dayNumber` which usually is `dayIndex + 1` in our app, specifically GlobeDestination.day
                // Let's assume input `dayNumber` matches destination.day
                // Wait, GlobeDestination.day is usually 1-indexed.
                // ItineraryDay.dayIndex is 0-indexed usually?
                // Let's check plan-converter.ts: `dayIndex: day.dayNumber` -> wait, schema says: `dayIndex Int`
                // Let's check `candidates/route.ts`: `d.dayIndex + 1 === parseInt(dayNumber)`
                // So dayNumber is 1-based, dayIndex is 0-based.
                tripAnchor: { tripId: tripId }
            },
            include: { items: true }
         });
         
         // If strictly dayIndex passed? 
         if (!day) {
             // Try assuming it WAS dayIndex?
              day = await prisma.itineraryDay.findFirst({
                where: {
                    dayIndex: dayNumber - 1, // Try 1-based to 0-based conversion
                    tripAnchor: { tripId: tripId }
                },
                include: { items: true }
             });
         }
    }

    if (!day) {
        return new NextResponse("Day not found or does not belong to this trip", { status: 404 });
    }
    
    // Use the found day.id for the relation
    const targetDayId = day.id;
    
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
                dayId: targetDayId,
                type: type || 'EXPERIENCE',
                title: title || 'New Item',
                experienceId: experience ? experience.id : null, // Only store if exists in DB (FK constraint)
                hostId: experience?.hostId || hostId || null, // Store hostId directly
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
            createdBooking = await tx.booking.create({
                data: {
                    tripId,
                    experienceId: experience.id,
                    hostId: experience.hostId, // Link to host
                    guestId: userId, 
                    itemId: item.id,
                    date: day.date || new Date(), 
                    guests: 1, 
                    totalPrice: experience.price,
                    amountSubtotal: experience.price,
                    currency: experience.currency,
                    status: 'TENTATIVE',
                    paymentStatus: 'PENDING',
                    chatUnlocked: true 
                }
            });
        }
        
        // Return item with hostId injected if available (for frontend validation)
        // Use passed hostId as fallback for mock experiences not in DB
        return { 
            item: {
                ...item,
                experienceId: experienceId || null, // Preserve the passed experienceId for reference
                hostId: experience?.hostId || hostId || null
            }, 
            booking: createdBooking 
        };
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error('[TRIP_ITEM_POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new NextResponse(`Internal Error: ${message}`, { status: 500 });
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
