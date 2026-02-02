import { auth } from '@/auth';
import { releasePayout } from '@/lib/stripe/payouts';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const session = await auth();
    // In real app, check for ADMIN role
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId } = await req.json();
    if (!bookingId) {
        return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 });
    }

    const transfer = await releasePayout(bookingId);

    return NextResponse.json({ success: true, transfer });
  } catch (error: any) {
    console.error('Payout release error:', error);
    return NextResponse.json({ error: error.message || 'Payout failed' }, { status: 500 });
  }
}
