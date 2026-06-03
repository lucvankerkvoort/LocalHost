import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { supportsItineraryItemPlaceIdColumn } from '@/lib/trips/place-id-compat';
import { z } from 'zod';

const ItineraryItemTypeSchema = z.enum([
  'SIGHT', 'EXPERIENCE', 'MEAL', 'FREE_TIME', 'TRANSPORT', 'NOTE', 'LODGING',
]);

const CreateItineraryItemSchema = z.object({
  dayId: z.string().uuid().optional(),
  dayNumber: z.number().int().positive().optional(),
  experienceId: z.string().uuid().optional(),
  hostId: z.string().uuid().optional(),
  title: z.string().min(1).max(200).optional(),
  type: ItineraryItemTypeSchema.optional(),
  locationName: z.string().max(200).optional(),
  placeId: z.string().max(200).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
}).refine(data => data.dayId || data.dayNumber !== undefined, {
  message: 'Either dayId or dayNumber must be provided',
});

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
    const parsed = CreateItineraryItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 });
    }
    const { dayId, dayNumber, experienceId, hostId, title, type, locationName, placeId, lat, lng } = parsed.data;

    // Find the day to attach to.
    // dayNumber is 1-based (matches GlobeDestination.day); dayIndex in DB is 0-based.
    let day = null;

    if (dayId) {
      day = await prisma.itineraryDay.findFirst({
        where: { id: dayId, tripAnchor: { tripId } },
        include: { items: { select: { id: true, orderIndex: true } } },
      });
    }

    if (!day && dayNumber !== undefined) {
      day = await prisma.itineraryDay.findFirst({
        where: { dayIndex: dayNumber - 1, tripAnchor: { tripId } },
        include: { items: { select: { id: true, orderIndex: true } } },
      });
    }

    if (!day) {
        return new NextResponse("Day not found or does not belong to this trip", { status: 404 });
    }
    
    // Use the found day.id for the relation
    const targetDayId = day.id;
    
    const userId = session.user.id;
    const supportsItemPlaceId = await supportsItineraryItemPlaceIdColumn(prisma);

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

        const baseItemData = {
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
        } as const;

        let item: {
          id: string;
          dayId: string;
          type: string;
          title: string;
          description: string | null;
          startTime: Date | null;
          endTime: Date | null;
          locationName: string | null;
          lat: number | null;
          lng: number | null;
          experienceId: string | null;
          hostId: string | null;
          orderIndex: number;
          createdByAI: boolean;
        };

        item = await tx.itineraryItem.create({
          data: supportsItemPlaceId
            ? {
                ...baseItemData,
                placeId: typeof placeId === 'string' ? placeId : null,
              }
            : baseItemData,
          select: {
            id: true,
            dayId: true,
            type: true,
            title: true,
            description: true,
            startTime: true,
            endTime: true,
            locationName: true,
            lat: true,
            lng: true,
            experienceId: true,
            hostId: true,
            orderIndex: true,
            createdByAI: true,
          },
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
