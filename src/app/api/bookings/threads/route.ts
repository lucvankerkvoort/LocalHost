import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { resolveBookingHostId } from '@/lib/synthetic-bots/chat-trigger';

type BookingWithThreadContext = Prisma.BookingGetPayload<{
  include: {
    host: {
      select: {
        id: true;
        name: true;
        image: true;
      };
    };
    guest: {
      select: {
        id: true;
        name: true;
        image: true;
      };
    };
    experience: {
      select: {
        hostId: true;
      };
    };
    messages: {
      select: {
        id: true;
        senderId: true;
        content: true;
        createdAt: true;
        isRead: true;
      };
    };
  };
}>;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const userId = session.user.id;

    const bookings = (await prisma.booking.findMany({
      where: {
        status: { not: 'CANCELLED' },
        OR: [
          { guestId: userId },
          { hostId: userId },
          { experience: { hostId: userId } },
        ],
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        guest: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        experience: {
          select: {
            hostId: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            senderId: true,
            content: true,
            createdAt: true,
            isRead: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })) as BookingWithThreadContext[];

    const threads = bookings.map((booking) => {
      const hostId = resolveBookingHostId({
        id: booking.id,
        hostId: booking.hostId,
        status: booking.status,
        experience: { hostId: booking.experience.hostId },
      });

      const isHostViewer = userId === hostId;
      const counterpart = isHostViewer ? booking.guest : booking.host;
      const counterpartId = counterpart?.id ?? (isHostViewer ? booking.guestId : hostId);
      const counterpartName = counterpart?.name ?? (isHostViewer ? 'Traveler' : 'Host');
      const counterpartPhoto = counterpart?.image ?? '/placeholder-host.jpg';
      const latestMessage = booking.messages[0]
        ? {
            id: booking.messages[0].id,
            senderId: booking.messages[0].senderId,
            content: booking.messages[0].content,
            createdAt: booking.messages[0].createdAt.toISOString(),
            isRead: booking.messages[0].isRead,
          }
        : null;

      return {
        bookingId: booking.id,
        counterpartId,
        counterpartName,
        counterpartPhoto,
        latestMessage,
      };
    });

    return NextResponse.json({ threads });
  } catch (error) {
    console.error('[BOOKING_THREADS_GET]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
