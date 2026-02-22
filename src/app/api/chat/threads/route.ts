import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { resolveBookingHostId } from '@/lib/synthetic-bots/chat-trigger';

const counterpartUserSelect = {
  id: true,
  name: true,
  image: true,
} satisfies Prisma.UserSelect;

const threadInclude = {
  participants: {
    include: {
      user: {
        select: counterpartUserSelect,
      },
    },
  },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: {
      sender: {
        select: counterpartUserSelect,
      },
    },
  },
} satisfies Prisma.ChatThreadInclude;

type ThreadWithContext = Prisma.ChatThreadGetPayload<{
  include: typeof threadInclude;
}>;

type ThreadSummary = {
  id: string;
  bookingId: string | null;
  counterpartId: string;
  counterpartName: string;
  counterpartPhoto: string;
  latestMessage: {
    id: string;
    senderId: string;
    content: string;
    createdAt: string;
    isRead: boolean;
    sender: {
      name: string | null;
      image: string | null;
    };
  } | null;
};

function toThreadSummary(thread: ThreadWithContext, viewerId: string): ThreadSummary {
  const counterpartParticipant =
    thread.participants.find((participant) => participant.userId !== viewerId) ??
    thread.participants[0];

  const counterpartId = counterpartParticipant?.user?.id ?? viewerId;
  const counterpartName = counterpartParticipant?.user?.name ?? 'User';
  const counterpartPhoto = counterpartParticipant?.user?.image ?? '/placeholder-host.jpg';
  const latest = thread.messages[0] ?? null;

  return {
    id: thread.id,
    bookingId: thread.bookingId,
    counterpartId,
    counterpartName,
    counterpartPhoto,
    latestMessage: latest
      ? {
          id: latest.id,
          senderId: latest.senderId,
          content: latest.content,
          createdAt: latest.createdAt.toISOString(),
          isRead: latest.isRead,
          sender: {
            name: latest.sender?.name ?? null,
            image: latest.sender?.image ?? null,
          },
        }
      : null,
  };
}

async function loadThread(threadId: string): Promise<ThreadWithContext | null> {
  return (await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: threadInclude,
  })) as ThreadWithContext | null;
}

async function findExistingDirectThread(
  viewerId: string,
  participantId: string
): Promise<ThreadWithContext | null> {
  const candidateThreads = (await prisma.chatThread.findMany({
    where: {
      bookingId: null,
      participants: {
        some: { userId: viewerId },
      },
    },
    include: threadInclude,
    orderBy: { updatedAt: 'desc' },
  })) as ThreadWithContext[];

  return (
    candidateThreads.find((thread) => {
      const participantIds = new Set(thread.participants.map((participant) => participant.userId));
      return (
        participantIds.has(viewerId) &&
        participantIds.has(participantId) &&
        participantIds.size === 2
      );
    }) ?? null
  );
}

async function assertBookingParticipants(
  bookingId: string,
  viewerId: string,
  participantId: string
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      guestId: true,
      hostId: true,
      status: true,
      experience: {
        select: {
          hostId: true,
        },
      },
    },
  });

  if (!booking) {
    return {
      error: new NextResponse('Booking not found', { status: 404 }),
    };
  }

  const hostId = resolveBookingHostId(booking);
  const validParticipantIds = new Set([booking.guestId, hostId]);
  if (!validParticipantIds.has(viewerId) || !validParticipantIds.has(participantId)) {
    return {
      error: new NextResponse('Forbidden', { status: 403 }),
    };
  }

  return { booking };
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const viewerId = session.user.id;
    const rawThreads = (await prisma.chatThread.findMany({
      where: {
        participants: {
          some: { userId: viewerId },
        },
      },
      include: threadInclude,
      orderBy: {
        updatedAt: 'desc',
      },
    })) as ThreadWithContext[];

    const threads = rawThreads.map((thread) => toThreadSummary(thread, viewerId));
    return NextResponse.json({ threads });
  } catch (error) {
    console.error('[CHAT_THREADS_GET]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const viewerId = session.user.id;
    const body = await req.json();
    const participantId =
      typeof body?.participantId === 'string' ? body.participantId.trim() : '';
    const bookingId =
      typeof body?.bookingId === 'string' && body.bookingId.trim().length > 0
        ? body.bookingId.trim()
        : null;

    if (!participantId) {
      return new NextResponse('participantId is required', { status: 400 });
    }
    if (participantId === viewerId) {
      return new NextResponse('Cannot create a chat with yourself', { status: 400 });
    }

    const participant = await prisma.user.findUnique({
      where: { id: participantId },
      select: { id: true },
    });
    if (!participant) {
      return new NextResponse('Participant not found', { status: 404 });
    }

    let thread: ThreadWithContext | null = null;

    if (bookingId) {
      const bookingCheck = await assertBookingParticipants(bookingId, viewerId, participantId);
      if ('error' in bookingCheck) {
        return bookingCheck.error;
      }

      thread = (await prisma.chatThread.findUnique({
        where: { bookingId },
        include: threadInclude,
      })) as ThreadWithContext | null;

      if (!thread) {
        thread = (await prisma.chatThread.create({
          data: {
            bookingId,
            participants: {
              create: [{ userId: viewerId }, { userId: participantId }],
            },
          },
          include: threadInclude,
        })) as ThreadWithContext;
      } else {
        const participantIds = new Set(thread.participants.map((entry) => entry.userId));
        const missingParticipantIds = [viewerId, participantId].filter(
          (candidateId) => !participantIds.has(candidateId)
        );
        if (missingParticipantIds.length > 0) {
          const currentThreadId = thread.id;
          await prisma.chatParticipant.createMany({
            data: missingParticipantIds.map((userId) => ({
              threadId: currentThreadId,
              userId,
            })),
            skipDuplicates: true,
          });
          thread = await loadThread(currentThreadId);
        }
      }
    } else {
      thread = await findExistingDirectThread(viewerId, participantId);
      if (!thread) {
        thread = (await prisma.chatThread.create({
          data: {
            participants: {
              create: [{ userId: viewerId }, { userId: participantId }],
            },
          },
          include: threadInclude,
        })) as ThreadWithContext;
      }
    }

    if (!thread) {
      return new NextResponse('Failed to create or load thread', { status: 500 });
    }

    return NextResponse.json({ thread: toThreadSummary(thread, viewerId) });
  } catch (error) {
    console.error('[CHAT_THREADS_POST]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
