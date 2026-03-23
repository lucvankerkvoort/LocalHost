import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { auth } from '@/auth';
import { z } from 'zod';

const CreateCandidateSchema = z.object({
  tripId: z.string().uuid().optional(),
  hostId: z.string().uuid().optional(),
  experienceId: z.string().uuid().optional(),
  dayId: z.string().uuid().optional(),
  dayNumber: z.union([z.string(), z.number()]).optional(),
  date: z.string().datetime().optional(),
  itemId: z.string().uuid().optional(),
  experienceData: z.object({
    title: z.string().max(200).optional(),
    description: z.string().max(2000).optional(),
    city: z.string().max(100).optional(),
    price: z.number().positive().optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  }).optional(),
});

type TripWithStops = Prisma.TripGetPayload<{
  include: { stops: { include: { days: true } } };
}>;

type TripDay = TripWithStops['stops'][number]['days'][number];

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dayNumber = searchParams.get('dayNumber');
    const tripId = searchParams.get('tripId');
    const candidateId = searchParams.get('candidateId');

    if (candidateId) {
      const candidate = await prisma.booking.findFirst({
        where: {
          id: candidateId,
          guestId: session.user.id,
          ...(tripId ? { tripId } : {}),
        },
        include: {
          experience: true,
          host: true,
        },
      });

      return NextResponse.json({ candidates: candidate ? [candidate] : [] });
    }

    // Find active trip for user
    // ideally we pass tripId, but if we just want "candidates for my active trip"
    // we might need to look it up.
    // For now, let's assume we want candidates for *any* active trip or a specific one?
    // The previous code passed `?dayNumber=...`. 
    // Let's see if we can find the trip.
    
    // Better: GET candidates should probably be scoped to a trip or just return empty for now if not used.
    // The frontend called: fetch(`/api/itinerary/candidates?dayNumber=${...}`)
    
    // Let's implement a basic lookup for the most recent trip's candidates on that day.
    
    const trip: TripWithStops | null = tripId
      ? (await prisma.trip.findFirst({
          where: { id: tripId, userId: session.user.id },
          include: { stops: { include: { days: true } } },
        })) as TripWithStops | null
      : (await prisma.trip.findFirst({
          where: { userId: session.user.id },
          orderBy: { updatedAt: 'desc' },
          include: { stops: { include: { days: true } } },
        })) as TripWithStops | null;

    if (!trip) {
        return NextResponse.json({ candidates: [] });
    }
    
    // Find the day ID
    let dayId: string | null = null;
    if (dayNumber) {
      const parsedDayNumber = Number.parseInt(dayNumber, 10);
      for (const stop of trip.stops) {
        const day = stop.days.find(
          (d) => d.dayIndex + 1 === parsedDayNumber || d.dayIndex === parsedDayNumber
        );
        if (day) {
          dayId = day.id;
          break;
        }
      }
    }

    const candidates = await prisma.booking.findMany({
        where: {
            tripId: trip.id,
            status: 'TENTATIVE', 
            ...(dayId
              ? {
                  OR: [
                    { itemId: null },
                    {
                      itineraryItem: {
                        dayId,
                      },
                    },
                  ],
                }
              : {}),
        },
        include: {
            experience: true,
            host: true
        }
    });

    return NextResponse.json({ candidates });

  } catch (error) {
    console.error('GET /candidates error:', error);
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
    const parsed = CreateCandidateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 });
    }
    const { tripId, hostId, experienceId, dayId, dayNumber, date, itemId } = parsed.data;

    // 1. Find the active trip
    let trip: TripWithStops | null;
    
    if (tripId) {
        trip = (await prisma.trip.findUnique({
            where: { id: tripId },
            include: { stops: { include: { days: true } } }
        })) as TripWithStops | null;
        
        // Verify ownership
        if (trip && trip.userId !== session.user.id) {
             return new NextResponse('Forbidden', { status: 403 });
        }
    } else {
        // Fallback to most recent
        trip = (await prisma.trip.findFirst({
            where: { userId: session.user.id },
            orderBy: { updatedAt: 'desc' },
            include: { stops: { include: { days: true } } }
        })) as TripWithStops | null;
    }

    if (!trip) {
        return new NextResponse('Trip not found', { status: 404 });
    }

    // 2. Resolve Day
    let targetDay: TripDay | null = null;
    
    // Try finding by dayId first if available
    if (dayId) {
        // We can search directly in the DB or within the loaded trip
        // Searching within loaded trip avoids an extra DB call if we trust the structure
        for (const stop of trip.stops) {
             const d = stop.days.find((day) => day.id === dayId);
             if (d) {
                 targetDay = d;
                 break;
             }
        }
    }
    
    // Fallback to dayNumber
    if (!targetDay && dayNumber) {
        // Simple search across stops
        const parsedDayNumber = Number.parseInt(dayNumber, 10);
        for (const stop of trip.stops) {
            const d = stop.days.find((day) => day.dayIndex + 1 === parsedDayNumber);
            if (d) {
                targetDay = d;
                break;
            }
        }
    }

    if (!targetDay) {
        // Fallback: Use first day if valid? Or Error.
        console.error('[CandidateAPI] Day not found:', { tripId: trip.id, dayId, dayNumber });
         return new NextResponse('Day not found in trip', { status: 400 });
    }

    if (itemId) {
        const item = await prisma.itineraryItem.findFirst({
            where: {
                id: itemId,
                dayId: targetDay.id,
                day: {
                    tripAnchor: {
                        tripId: trip.id,
                    },
                },
            },
            select: { id: true },
        });

        if (!item) {
            return new NextResponse('Item not found in trip day', { status: 403 });
        }

        const existingCandidate = await prisma.booking.findFirst({
            where: {
                tripId: trip.id,
                guestId: session.user.id,
                itemId,
                status: { in: ['TENTATIVE', 'PENDING'] },
                paymentStatus: { not: 'FAILED' },
            },
            orderBy: { updatedAt: 'desc' },
            include: {
                experience: true,
                host: {
                    select: { id: true, name: true, image: true, city: true }
                }
            },
        });

        if (existingCandidate) {
            return NextResponse.json({
                candidate: existingCandidate,
                message: 'Candidate reused',
            });
        }
    }

    // 3. Get Experience — must already exist in the database
    let experience = null;
    
    if (experienceId) {
        experience = await prisma.experience.findUnique({
            where: { id: experienceId }
        });
    }

    // On-the-fly experience/host creation is intentionally not supported.
    // All experiences and hosts must exist in the database before creating a candidate.

    if (!experience) {
        return new NextResponse('Experience not found and could not be created', { status: 404 });
    }

    // 4. Create "Candidate" (Booking)
    // We use the Booking model but mark it as TENTATIVE
    // chatUnlocked: false - chat only unlocks after payment confirmation
    const booking = await prisma.booking.create({
        data: {
            tripId: trip.id,
            guestId: session.user.id,
            hostId: hostId || experience.hostId, // Ensure hostId
            itemId: itemId || null,
            experienceId: experience.id, // Use created/found experience's ID
            date: date ? new Date(date) : (targetDay.date || new Date()),
            status: 'TENTATIVE',
            paymentStatus: 'PENDING',
            totalPrice: experience.price,
            amountSubtotal: experience.price, // Required for payment validation
            currency: experience.currency,
            guests: 1, // Default
            chatUnlocked: false // Chat unlocks only after CONFIRMED status
        },
        include: {
            experience: true,
            host: {
                select: { id: true, name: true, image: true, city: true }
            }
        }
    });

    return NextResponse.json({ 
        candidate: booking,
        message: 'Candidate created' 
    });

  } catch (error) {
    console.error('POST /candidates error:', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
