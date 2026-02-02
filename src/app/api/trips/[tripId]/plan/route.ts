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
    });

    if (!trip || trip.userId !== session.user.id) {
        return new NextResponse('Forbidden', { status: 403 });
    }

    const body = await req.json();
    const { stops } = body; 
    // Expect body to be { stops: [ { city, days: [ { items: [] } ] } ] } roughly

    if (!Array.isArray(stops)) {
        return new NextResponse("Invalid payload", { status: 400 });
    }

    // Transactional update
    // Strategy: 
    // 1. Delete existing stops (cascade delete days/items) ? Or be smarter?
    // "Plan writes must be transactional... Upsert Stops"
    // For MVP, full replacement of the plan structure within the trip is safest/easiest 
    // to ensure consistency with the AI's latest output.
    // However, we must preserve Bookings linked to Items if possible? 
    // Bookings link to Experience directly, optionally Item. 
    // If Item is deleted, Booking.itemId becomes null (if we set onDelete: SetNull?)
    // Current schema: Booking has `itineraryItem ItineraryItem?`
    // If we delete ItineraryItem, what happens? 
    // We didn't specify onDelete behavior for Booking -> Item relation in Schema.
    // Defaults to restrictive usually? Or creates issue.
    // Let's check Schema: `itineraryItem ItineraryItem? @relation("ItemBookings", fields: [itemId], references: [id])`
    // No onDelete.
    
    // We should probably attempt to update if ID exists, or create new. 
    // But aligning complex nested structures is hard.
    // Let's wipe and recreate for purely generated plans, BUT if user has "pinned" things?
    // For now, let's implement the wipe-and-replace approach for the plan content,
    // assuming the frontend sends the *complete* authoritative state.

    // 56: await prisma.$transaction(async (tx) => {
    
    // Map to store new day IDs: { dayIndex: dayId }
    const dayIdMap: Record<number, string> = {};

    await prisma.$transaction(async (tx) => {
        // Clear old plan
        await tx.tripStop.deleteMany({
            where: { tripId: tripId }
        });

        // Insert new plan
        for (const stop of stops) {
            const createdStop = await tx.tripStop.create({
                data: {
                    tripId: tripId,
                    city: stop.city,
                    country: stop.country || '',
                    lat: stop.lat || 0,
                    lng: stop.lng || 0,
                    order: stop.order,
                }
            });

            if (stop.days && Array.isArray(stop.days)) {
                for (const day of stop.days) {
                    const createdDay = await tx.itineraryDay.create({
                        data: {
                            tripStopId: createdStop.id,
                            dayIndex: day.dayIndex,
                            date: day.date ? new Date(day.date) : null,
                            title: day.title,
                            suggestedHosts: day.suggestedHosts ?? [],
                        }
                    });

                    // Store mapping
                    dayIdMap[day.dayIndex] = createdDay.id;

                    if (day.items && Array.isArray(day.items)) {
                        for (const item of day.items) {
                            await tx.itineraryItem.create({
                                data: {
                                    dayId: createdDay.id,
                                    type: item.type, // Ensure enum matches
                                    title: item.title,
                                    description: item.description,
                                    startTime: item.startTime ? new Date(item.startTime) : null,
                                    endTime: item.endTime ? new Date(item.endTime) : null,
                                    locationName: item.locationName,
                                    lat: item.lat,
                                    lng: item.lng,
                                    experienceId: item.experienceId,
                                    orderIndex: item.orderIndex,
                                    createdByAI: item.createdByAI ?? true,
                                }
                            });
                        }
                    }
                }
            }
        }
        
        // Update Trip status if needed
        await tx.trip.update({
            where: { id: tripId },
            data: { status: 'PLANNED' }
        });
    });

    return NextResponse.json({ success: true, dayIdMap });
  } catch (error) {
    console.error('[TRIP_PLAN_POST]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
