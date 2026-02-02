import { stripe } from './stripe';
import { prisma } from '@/lib/prisma';
import { StripeOnboardingStatus } from '@prisma/client';

export async function createConnectAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // If user already has an account, return it
  if (user.stripeConnectedAccountId) {
    return user.stripeConnectedAccountId;
  }

  // Create Express account
  const account = await stripe.accounts.create({
    type: 'express',
    email: user.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      userId: user.id,
    },
  });

  // Save to DB
  await prisma.user.update({
    where: { id: userId },
    data: {
      stripeConnectedAccountId: account.id,
      stripeOnboardingStatus: 'PENDING',
    },
  });

  return account.id;
}

export async function createAccountLink(accountId: string, origin: string) {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/api/hosts/stripe/reauth`,
    return_url: `${origin}/api/hosts/stripe/return`,
    type: 'account_onboarding',
  });

  return accountLink.url;
}

export async function updateAccountStatus(accountId: string) {
  const account = await stripe.accounts.retrieve(accountId);
  
  const payoutsEnabled = account.payouts_enabled;
  const chargesEnabled = account.charges_enabled;
  
  let status: StripeOnboardingStatus = 'PENDING';
  
  if (payoutsEnabled && chargesEnabled && account.details_submitted) {
    status = 'COMPLETE';
  } else if (account.requirements?.disabled_reason) {
    status = 'RESTRICTED';
  }

  // Find user by account ID and update
  const user = await prisma.user.findFirst({
    where: { stripeConnectedAccountId: accountId },
  });

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        payoutsEnabled,
        chargesEnabled,
        stripeOnboardingStatus: status,
      },
    });
  }

  return { status, payoutsEnabled, chargesEnabled };
}
