import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { HOSTS } from '@/lib/data/hosts';

/**
 * POST /api/chat/preliminary
 * Send a preliminary message to a host (before booking)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { candidateId, message } = body;

    if (!candidateId || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: candidateId, message' },
        { status: 400 }
      );
    }

    // Get candidate and verify ownership
    const candidate = await prisma.experienceCandidate.findFirst({
      where: {
        id: candidateId,
        userId: session.user.id,
      },
      include: {
        preliminaryChat: true,
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // Check if already has a preliminary chat
    if (candidate.preliminaryChat) {
      return NextResponse.json(
        { error: 'Preliminary message already sent' },
        { status: 409 }
      );
    }

    // Only allow preliminary chat for INTERESTED status
    if (candidate.status !== 'INTERESTED') {
      return NextResponse.json(
        { error: 'Cannot send preliminary message for this status' },
        { status: 400 }
      );
    }

    // Create preliminary chat
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const preliminaryChat = await prisma.preliminaryChat.create({
      data: {
        candidateId,
        userMessage: message,
        userSentAt: new Date(),
        expiresAt,
        status: 'OPEN',
      },
    });

    // Update candidate status
    await prisma.experienceCandidate.update({
      where: { id: candidateId },
      data: { status: 'AWAITING_REPLY' },
    });

    // For MVP: Simulate host reply after a delay (in production, this would be real)
    // This is a placeholder - in real app, host would receive notification
    const host = HOSTS.find(h => h.id === candidate.hostId);
    if (host) {
      // Simulate host auto-reply after 5 seconds (for demo purposes)
      setTimeout(async () => {
        try {
          await prisma.preliminaryChat.update({
            where: { id: preliminaryChat.id },
            data: {
              hostReply: `Hi! I'm ${host.name} and I'd love to host you. ${host.quote} Looking forward to meeting you!`,
              hostRepliedAt: new Date(),
              status: 'CLOSED',
            },
          });
          await prisma.experienceCandidate.update({
            where: { id: candidateId },
            data: { status: 'REPLIED' },
          });
        } catch (e) {
          console.error('[preliminary] Auto-reply error:', e);
        }
      }, 5000);
    }

    return NextResponse.json({ 
      preliminaryChat,
      message: 'Message sent successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('[preliminary] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
