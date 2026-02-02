import { auth } from '@/auth';
import { createConnectAccount, createAccountLink } from '@/lib/stripe/connect';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate user exists in DB
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Validate user has email (required for Stripe Connect)
    if (!user.email) {
      return NextResponse.json({ error: 'Email required for Stripe Connect' }, { status: 400 });
    }

    // 1. Create/Get Connect Account
    const accountId = await createConnectAccount(session.user.id);

    // 2. Generate Onboarding Link
    // Use the request origin to construct absolute URL
    const origin = new URL(req.url).origin;
    const accountLink = await createAccountLink(accountId, origin);

    return NextResponse.json({ url: accountLink });
  } catch (error) {
    console.error('Stripe Connect error:', error);
    return NextResponse.json({ error: 'Failed to initiate onboarding' }, { status: 500 });
  }
}
