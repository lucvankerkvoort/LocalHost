import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const CreateBookingSchema = z.object({
  experienceId: z.string().uuid(),
  date: z.string().datetime(),
  guests: z.number().int().min(1).max(50),
  totalPrice: z.number().positive(),
  currency: z.string().length(3),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = CreateBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 });
    }

    const { experienceId, date, guests, totalPrice, currency } = parsed.data;

    // Fetch experience to get hostId
    const experience = await prisma.experience.findUnique({
       where: { id: experienceId },
       include: { host: true }
    });

    if (!experience) return NextResponse.json({ error: 'Experience not found' }, { status: 404 });

    const booking = await prisma.booking.create({
      data: {
        experienceId,
        guestId: session.user.id,
        hostId: experience.hostId, // Link to host
        date: new Date(date),
        guests,
        totalPrice, // User pay amount
        amountSubtotal: totalPrice, // Base amount
        currency,
        status: 'TENTATIVE',
        paymentStatus: 'PENDING',
      },
    });

    return NextResponse.json({ id: booking.id });
  } catch (error) {
    console.error('Booking creation error:', error);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }
}
