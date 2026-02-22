import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { maybeEnqueueSyntheticReplyForMessage } from '@/lib/synthetic-bots/chat-trigger';
import { processDueSyntheticReplyJobs } from '@/lib/synthetic-bots/jobs';

async function resolveThreadForViewer(threadId: string, viewerId: string) {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: {
      participants: {
        select: {
          userId: true,
        },
      },
      booking: {
        include: {
          experience: {
            select: {
              hostId: true,
            },
          },
          host: {
            select: {
              id: true,
              isSyntheticHost: true,
              syntheticBotEnabled: true,
              syntheticResponseLatencyMinSec: true,
              syntheticResponseLatencyMaxSec: true,
            },
          },
        },
      },
    },
  });

  if (!thread) return { error: new NextResponse('Thread not found', { status: 404 }) };
  const isParticipant = thread.participants.some((participant) => participant.userId === viewerId);
  if (!isParticipant) return { error: new NextResponse('Forbidden', { status: 403 }) };

  return { thread };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { threadId } = await params;
    const resolved = await resolveThreadForViewer(threadId, session.user.id);
    if ('error' in resolved) {
      return resolved.error;
    }

    const messages = await prisma.message.findMany({
      where: { threadId: resolved.thread.id },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    return NextResponse.json(messages);
  } catch (error) {
    console.error('[CHAT_THREAD_MESSAGES_GET]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { threadId } = await params;
    const body = await req.json();
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    if (!content) {
      return new NextResponse('Missing content', { status: 400 });
    }

    const resolved = await resolveThreadForViewer(threadId, session.user.id);
    if ('error' in resolved) {
      return resolved.error;
    }

    const message = await prisma.message.create({
      data: {
        threadId: resolved.thread.id,
        bookingId: resolved.thread.bookingId ?? null,
        senderId: session.user.id,
        content,
      },
    });

    if (resolved.thread.booking) {
      await maybeEnqueueSyntheticReplyForMessage({
        booking: {
          id: resolved.thread.booking.id,
          hostId: resolved.thread.booking.hostId,
          status: resolved.thread.booking.status,
          experience: { hostId: resolved.thread.booking.experience.hostId },
          host: resolved.thread.booking.host,
        },
        senderId: session.user.id,
        triggerMessageId: message.id,
      });

      try {
        await processDueSyntheticReplyJobs({ limit: 1 });
      } catch (error) {
        console.error('[CHAT_THREAD_MESSAGES_POST_SYNTHETIC_PROCESS]', error);
      }
    }

    return NextResponse.json(message);
  } catch (error) {
    console.error('[CHAT_THREAD_MESSAGES_POST]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
