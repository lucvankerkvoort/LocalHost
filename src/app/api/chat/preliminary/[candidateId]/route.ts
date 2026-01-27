import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ candidateId: string }>;
}

/**
 * GET /api/chat/preliminary/[candidateId]
 * Get preliminary chat state for a candidate
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
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // Check for expiration
    if (candidate.preliminaryChat?.status === 'OPEN' && candidate.preliminaryChat.expiresAt) {
      const now = new Date();
      if (now > candidate.preliminaryChat.expiresAt) {
        // Update to expired
        await prisma.preliminaryChat.update({
          where: { id: candidate.preliminaryChat.id },
          data: { status: 'EXPIRED' },
        });
        await prisma.experienceCandidate.update({
          where: { id: candidateId },
          data: { status: 'UNRESPONSIVE' },
        });
        
        // Refresh data
        const updated = await prisma.preliminaryChat.findUnique({
          where: { id: candidate.preliminaryChat.id },
        });
        
        return NextResponse.json({ preliminaryChat: updated });
      }
    }

    return NextResponse.json({ preliminaryChat: candidate.preliminaryChat });
  } catch (error) {
    console.error('[preliminary/candidateId] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preliminary chat' },
      { status: 500 }
    );
  }
}
