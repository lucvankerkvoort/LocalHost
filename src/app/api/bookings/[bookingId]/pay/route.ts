import { auth } from '@/auth';
import { createBookingPayment } from '@/lib/stripe/payments';
import { NextResponse } from 'next/server';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { bookingId } = await params;

    const result = await createBookingPayment(bookingId, session.user.id);

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Payment creation error:', error);
    const message = error instanceof Error ? error.message : 'Payment creation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
