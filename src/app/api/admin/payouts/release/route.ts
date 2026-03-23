import { auth } from '@/auth';
import { releasePayout } from '@/lib/stripe/payouts';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const ReleasePayoutSchema = z.object({
  bookingId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    // TODO: enforce ADMIN role check here before release
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = ReleasePayoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 });
    }

    const transfer = await releasePayout(parsed.data.bookingId);

    return NextResponse.json({ success: true, transfer });
  } catch (error: unknown) {
    console.error('Payout release error:', error);
    return NextResponse.json({ error: 'Payout release failed' }, { status: 500 });
  }
}
