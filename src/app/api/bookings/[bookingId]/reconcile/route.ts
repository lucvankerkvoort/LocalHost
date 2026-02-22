import { auth } from '@/auth';
import { reconcileBookingPayment } from '@/lib/stripe/payments';
import { NextResponse } from 'next/server';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId } = await params;
    const result = await reconcileBookingPayment(bookingId, session.user.id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reconcile payment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
