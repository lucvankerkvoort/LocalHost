import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

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
            include: { experience: true }
        });

        if (!booking) {
            return new NextResponse('Booking not found', { status: 404 });
        }

        // Allow Guest or Host to view
        if (booking.guestId !== session.user.id && booking.experience.hostId !== session.user.id) {
            return new NextResponse('Forbidden', { status: 403 });
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
        const { content } = body;

        if (!content) return new NextResponse('Missing content', { status: 400 });

        const booking = await prisma.booking.findUnique({
            where: { id: bookingId },
            include: { experience: true }
        });

        if (!booking) {
            return new NextResponse('Booking not found', { status: 404 });
        }

        if (booking.guestId !== session.user.id && booking.experience.hostId !== session.user.id) {
             return new NextResponse('Forbidden', { status: 403 });
        }

        const message = await prisma.message.create({
            data: {
                bookingId,
                senderId: session.user.id,
                content
            }
        });

        return NextResponse.json(message);

    } catch (error) {
        console.error('[MESSAGES_POST]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}
