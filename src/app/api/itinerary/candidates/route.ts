import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

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
    
    const trip = tripId
      ? await prisma.trip.findFirst({
          where: { id: tripId, userId: session.user.id },
          include: { stops: { include: { days: true } } },
        })
      : await prisma.trip.findFirst({
          where: { userId: session.user.id },
          orderBy: { updatedAt: 'desc' },
          include: { stops: { include: { days: true } } },
        });

    if (!trip) {
        return NextResponse.json({ candidates: [] });
    }
    
    // Find the day ID
    let dayId = null;
    if (dayNumber) {
        const parsedDayNumber = parseInt(dayNumber);
        for (const stop of (trip as any).stops) {
            const day = stop.days.find((d: any) => d.dayIndex + 1 === parsedDayNumber || d.dayIndex === parsedDayNumber);
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
    const { tripId, hostId, experienceId, dayId, dayNumber, date, itemId } = body;

    // 1. Find the active trip
    let trip;
    
    if (tripId) {
        trip = await prisma.trip.findUnique({
            where: { id: tripId },
            include: { stops: { include: { days: true } } }
        });
        
        // Verify ownership
        if (trip && trip.userId !== session.user.id) {
             return new NextResponse('Forbidden', { status: 403 });
        }
    } else {
        // Fallback to most recent
        trip = await prisma.trip.findFirst({
            where: { userId: session.user.id },
            orderBy: { updatedAt: 'desc' },
            include: { stops: { include: { days: true } } }
        });
    }

    if (!trip) {
        return new NextResponse('Trip not found', { status: 404 });
    }

    // 2. Resolve Day
    let targetDay = null;
    
    // Try finding by dayId first if available
    if (dayId) {
        // We can search directly in the DB or within the loaded trip
        // Searching within loaded trip avoids an extra DB call if we trust the structure
        for (const stop of (trip as any).stops) {
             const d = stop.days.find((day: any) => day.id === dayId);
             if (d) {
                 targetDay = d;
                 break;
             }
        }
    }
    
    // Fallback to dayNumber
    if (!targetDay && dayNumber) {
        // Simple search across stops
        for (const stop of (trip as any).stops) {
            const d = stop.days.find((day: any) => day.dayIndex + 1 === parseInt(dayNumber));
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
                    tripStop: {
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

    // 3. Get or Create Experience
    const { experienceData } = body;
    let experience = null;
    
    if (experienceId) {
        experience = await prisma.experience.findUnique({
            where: { id: experienceId }
        });
    }

    // If experience not found and we have experienceData, create it on-the-fly
    if (!experience && experienceData && hostId) {
        console.log('[CandidateAPI] Creating experience on-the-fly:', experienceData.title);
        
        // First, ensure the host exists (create placeholder if needed)
        let host = await prisma.user.findUnique({ where: { id: hostId } });
        
        if (!host) {
            console.log('[CandidateAPI] Creating placeholder host:', hostId);
            // Create a placeholder host user
            host = await prisma.user.create({
                data: {
                    id: hostId,
                    email: `${hostId}@localhost.placeholder`,
                    name: hostId.replace(/-/g, ' ').replace(/\d+$/, '').trim() || 'Local Host',
                    isHost: true,
                    city: experienceData.city || 'Unknown',
                    country: 'Unknown',
                }
            });
        }
        
        experience = await prisma.experience.create({
            data: {
                hostId: host.id,
                title: experienceData.title || 'Local Experience',
                description: experienceData.description || 'A unique local experience',
                category: 'ARTS_CULTURE', // Default category
                neighborhood: experienceData.city || 'Downtown', // Required field
                city: experienceData.city || 'Unknown',
                country: 'Unknown', // Could be derived from city
                duration: 120, // 2 hours default
                minGroupSize: 1,
                maxGroupSize: 6,
                price: experienceData.price || 5000,
                currency: 'USD',
                includedItems: [],
                excludedItems: [],
                photos: [],
                rating: 4.5,
                reviewCount: 0,
                isActive: true,
                latitude: experienceData.lat || null,
                longitude: experienceData.lng || null,
            }
        });
    }

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
