import { auth } from '@/auth';
import { createAccountLink, createConnectAccount } from '@/lib/stripe/connect';
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

    const accountId = await createConnectAccount(session.user.id);
    const origin = new URL(req.url).origin;
    const onboardingUrl = await createAccountLink(accountId, origin);
    return NextResponse.redirect(onboardingUrl);
  } catch (error) {
    console.error('Stripe reauth error:', error);
    return buildExperiencesRedirect(req, 'error');
  }
}
