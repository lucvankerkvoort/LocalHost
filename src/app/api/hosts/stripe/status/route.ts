import { auth } from '@/auth';
import { updateAccountStatus } from '@/lib/stripe/connect';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeConnectedAccountId: true, stripeOnboardingStatus: true, payoutsEnabled: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If we have an account ID, verify status with Stripe directly to be sure
    if (user.stripeConnectedAccountId) {
      const status = await updateAccountStatus(user.stripeConnectedAccountId);
      return NextResponse.json(status);
    }

    return NextResponse.json({ 
      status: user.stripeOnboardingStatus || 'NOT_STARTED', 
      payoutsEnabled: user.payoutsEnabled ?? false,
      chargesEnabled: false 
    });

  } catch (error) {
    console.error('Stripe status error:', error);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}
