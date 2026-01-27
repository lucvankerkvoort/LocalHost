import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { HOSTS } from '@/lib/data/hosts';

/**
 * POST /api/bookings
 * Create a booking for an experience candidate
 * 
 * For MVP: This is a stub without real Stripe integration.
 * In production, this would process payment before confirming.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { candidateId } = body;

    if (!candidateId) {
      return NextResponse.json(
        { error: 'Missing candidateId' },
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
        chatThread: true,
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // Can only book if not already booked or cancelled
    if (candidate.status === 'BOOKED') {
      return NextResponse.json({ error: 'Already booked' }, { status: 409 });
    }
    if (candidate.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Candidate was cancelled' }, { status: 400 });
    }

    // Get experience details for price
    const host = HOSTS.find(h => h.id === candidate.hostId);
    const experience = host?.experiences.find(e => e.id === candidate.experienceId);
    
    if (!host || !experience) {
      return NextResponse.json({ error: 'Experience not found' }, { status: 404 });
    }

    // MVP: Stub payment - in production, would create Stripe charge here
    // For now, just mark as booked immediately
    
    // Update candidate status to BOOKED
    await prisma.experienceCandidate.update({
      where: { id: candidateId },
      data: { status: 'BOOKED' },
    });

    // Create chat thread if doesn't exist
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

    // Add welcome message from host
    await prisma.chatMessage.create({
      data: {
        threadId: chatThread.id,
        senderId: host.id,
        senderType: 'HOST',
        content: `🎉 Booking confirmed! I'm ${host.name} and I'm excited to host you for "${experience.title}". Feel free to share any preferences or questions - I want to make this experience perfect for you!`,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Booking confirmed',
      booking: {
        candidateId,
        hostId: host.id,
        hostName: host.name,
        experienceId: experience.id,
        experienceTitle: experience.title,
        price: experience.price,
        dayNumber: candidate.dayNumber,
        date: candidate.date,
        timeSlot: candidate.timeSlot,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[bookings] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create booking' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/bookings
 * Get all bookings for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bookings = await prisma.experienceCandidate.findMany({
      where: {
        userId: session.user.id,
        status: 'BOOKED',
      },
      include: {
        chatThread: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { dayNumber: 'asc' },
    });

    // Enrich with host data
    const enrichedBookings = bookings.map(booking => {
      const host = HOSTS.find(h => h.id === booking.hostId);
      const experience = host?.experiences.find(e => e.id === booking.experienceId);
      
      return {
        ...booking,
        host: host ? {
          id: host.id,
          name: host.name,
          photo: host.photo,
          city: host.city,
        } : null,
        experience: experience ? {
          id: experience.id,
          title: experience.title,
          price: experience.price,
          duration: experience.duration,
        } : null,
      };
    });

    return NextResponse.json({ bookings: enrichedBookings });
  } catch (error) {
    console.error('[bookings] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bookings' },
      { status: 500 }
    );
  }
}
