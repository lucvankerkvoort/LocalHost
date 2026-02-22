import { auth } from '@/auth';
import { updateAccountStatus } from '@/lib/stripe/connect';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

function buildExperiencesRedirect(req: Request, stripeState: string) {
  const url = new URL('/experiences', req.url);
  url.searchParams.set('stripe', stripeState);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      const signinUrl = new URL('/api/auth/signin', req.url);
      signinUrl.searchParams.set('callbackUrl', '/experiences');
      return NextResponse.redirect(signinUrl);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeConnectedAccountId: true },
    });

    if (!user?.stripeConnectedAccountId) {
      return buildExperiencesRedirect(req, 'not_started');
    }

    const status = await updateAccountStatus(user.stripeConnectedAccountId);
    return buildExperiencesRedirect(req, status.status.toLowerCase());
  } catch (error) {
    console.error('Stripe return error:', error);
    return buildExperiencesRedirect(req, 'error');
  }
}
