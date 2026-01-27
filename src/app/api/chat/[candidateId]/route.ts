import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ candidateId: string }>;
}

/**
 * GET /api/chat/[candidateId]
 * Get full chat thread for a booked candidate
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { candidateId } = await params;

    // Verify ownership through candidate
    const candidate = await prisma.experienceCandidate.findFirst({
      where: {
        id: candidateId,
        userId: session.user.id,
      },
      include: {
        preliminaryChat: true,
        chatThread: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // Only allow full chat for booked candidates
    if (candidate.status !== 'BOOKED') {
      return NextResponse.json(
        { error: 'Full chat only available after booking' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      chatThread: candidate.chatThread,
      preliminaryChat: candidate.preliminaryChat, // Include for display at top
    });
  } catch (error) {
    console.error('[chat/candidateId] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat' },
      { status: 500 }
    );
  }
}
