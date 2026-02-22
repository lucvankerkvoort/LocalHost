import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { processDueSyntheticReplyJobs } from '@/lib/synthetic-bots/jobs';
import { maybeEnqueueSyntheticReplyForMessage, resolveBookingHostId } from '@/lib/synthetic-bots/chat-trigger';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ bookingId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }
        
        const { bookingId } = await params;

        // Verify participation
        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: {
                experience: {
                    select: {
                        hostId: true
                    }
                }
            }
        });

        if (!booking) {
            return new NextResponse('Booking not found', { status: 404 });
        }

        const hostParticipantId = resolveBookingHostId(booking);

        // Allow Guest or Host to view
        if (booking.guestId !== session.user.id && hostParticipantId !== session.user.id) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        // Keep chat open for pre-booking coordination; only block cancelled bookings.
        if (booking.status === 'CANCELLED') {
            return new NextResponse('Chat is unavailable for cancelled bookings', { status: 403 });
        }

        // Opportunistic processor trigger to drain due jobs on normal chat traffic.
        try {
            await processDueSyntheticReplyJobs({ limit: 3 });
        } catch (error) {
            console.error('[MESSAGES_GET_SYNTHETIC_PROCESS]', error);
        }

        const messages = await prisma.message.findMany({
            where: { bookingId },
            orderBy: { createdAt: 'asc' },
            include: { sender: { select: { id: true, name: true, image: true } } }
        });

        return NextResponse.json(messages);

    } catch (error) {
        console.error('[MESSAGES_GET]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ bookingId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { bookingId } = await params;
        const body = await req.json();
        const content = typeof body?.content === 'string' ? body.content.trim() : '';

        if (!content) return new NextResponse('Missing content', { status: 400 });

        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: {
                experience: {
                    select: {
                        hostId: true
                    }
                },
                host: {
                    select: {
                        id: true,
                        isSyntheticHost: true,
                        syntheticBotEnabled: true,
                        syntheticResponseLatencyMinSec: true,
                        syntheticResponseLatencyMaxSec: true,
                    }
                }
            }
        });

        if (!booking) {
            return new NextResponse('Booking not found', { status: 404 });
        }

        const hostParticipantId = resolveBookingHostId(booking);

        if (booking.guestId !== session.user.id && hostParticipantId !== session.user.id) {
             return new NextResponse('Forbidden', { status: 403 });
        }

        // Keep chat open for pre-booking coordination; only block cancelled bookings.
        if (booking.status === 'CANCELLED') {
            return new NextResponse('Chat is unavailable for cancelled bookings', { status: 403 });
        }

        const message = await prisma.message.create({
            data: {
                bookingId,
                senderId: session.user.id,
                content
            }
        });

        await maybeEnqueueSyntheticReplyForMessage({
            booking,
            senderId: session.user.id,
            triggerMessageId: message.id,
        });

        // Opportunistic processor trigger for low-latency replies once jobs become due.
        try {
            await processDueSyntheticReplyJobs({ limit: 1 });
        } catch (error) {
            console.error('[MESSAGES_POST_SYNTHETIC_PROCESS]', error);
        }

        return NextResponse.json(message);

    } catch (error) {
        console.error('[MESSAGES_POST]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}
