import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { HOSTS } from '@/lib/data/hosts';

interface RouteParams {
  params: Promise<{ candidateId: string }>;
}

/**
 * POST /api/chat/[candidateId]/messages
 * Send a message in full chat
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { candidateId } = await params;
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json(
        { error: 'Missing message content' },
        { status: 400 }
      );
    }

    // Verify ownership and booking status
    const candidate = await prisma.experienceCandidate.findFirst({
      where: {
        id: candidateId,
        userId: session.user.id,
      },
      include: {
        chatThread: true,
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    if (candidate.status !== 'BOOKED') {
      return NextResponse.json(
        { error: 'Full chat only available after booking' },
        { status: 403 }
      );
    }

    // Get or create chat thread
    let chatThread = candidate.chatThread;
    if (!chatThread) {
      chatThread = await prisma.chatThread.create({
        data: {
          candidateId,
          userId: session.user.id,
          hostId: candidate.hostId,
        },
      });
    }

    // Create the message
    const message = await prisma.chatMessage.create({
      data: {
        threadId: chatThread.id,
        senderId: session.user.id,
        senderType: 'USER',
        content,
      },
    });

    // Update thread timestamp
    await prisma.chatThread.update({
      where: { id: chatThread.id },
      data: { updatedAt: new Date() },
    });

    // For MVP: Simulate host auto-reply (in production, host would receive notification)
    const host = HOSTS.find(h => h.id === candidate.hostId);
    if (host) {
      // Simulate host reply after 3 seconds (for demo)
      setTimeout(async () => {
        try {
          const replies = [
            `That sounds great! I'm looking forward to showing you around.`,
            `Perfect! I'll make sure to prepare something special.`,
            `Thanks for letting me know! See you then.`,
            `Wonderful! Feel free to ask if you have any questions.`,
          ];
          const randomReply = replies[Math.floor(Math.random() * replies.length)];
          
          await prisma.chatMessage.create({
            data: {
              threadId: chatThread!.id,
              senderId: candidate.hostId,
              senderType: 'HOST',
              content: randomReply,
            },
          });
        } catch (e) {
          console.error('[chat/messages] Auto-reply error:', e);
        }
      }, 3000);
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error('[chat/messages] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
