import { stripe, PAYMENT_CONFIG } from './stripe';
import { prisma } from '@/lib/prisma';

export async function createBookingPayment(bookingId: string, userId?: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      experience: {
        include: {
          host: true,
        },
      },
      guest: true,
    },
  });

  if (!booking) throw new Error('Booking not found');
  
  // Validation 1: Booking must belong to the requesting user (guest)
  if (userId && booking.guestId !== userId) {
    throw new Error('Booking does not belong to this user');
  }
  
  // Validation 2: Booking must be in TENTATIVE status
  if (booking.status !== 'TENTATIVE') {
    throw new Error('Booking is not in TENTATIVE status');
  }
  
  // Validation 3: Host must be onboarded with Stripe Connect (charges + payouts enabled)
  const host = booking.experience.host;
  if (!host.stripeConnectedAccountId) {
    throw new Error('Host not onboarded for payments');
  }
  
  // Check if host account has charges enabled (required for Stripe Connect)
  if (!host.chargesEnabled) {
    throw new Error('Host Stripe account is not fully onboarded');
  }
  
  // Validation 4: amountSubtotal must be greater than 0
  if (!booking.amountSubtotal || booking.amountSubtotal <= 0) {
    throw new Error('Invalid booking amount');
  }

  const amountSubtotal = booking.amountSubtotal; // Already in cents (e.g. 15000 for $150.00)
  const platformFee = Math.round(amountSubtotal * PAYMENT_CONFIG.PLATFORM_FEE_PERCENT); // 10%
  const hostNet = amountSubtotal - platformFee;

  // Update booking with calculated fees (if different from DB defaults)
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      platformFee,
      hostNetAmount: hostNet,
    },
  });

  // Create Payment Intent
  // Funds are held in Platform account until manually transferred/payout to host
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountSubtotal,
    currency: PAYMENT_CONFIG.CURRENCY,
    automatic_payment_methods: { enabled: true },
    metadata: {
      bookingId: bookingId,
      hostId: booking.experience.host.id,
      guestId: booking.guest.id,
    },
    // We do NOT use destination charges here b/c we want to hold funds.
    // We will use separate Transfers later.
    // However, to link it for tracking, we could use `transfer_group`.
    transfer_group: bookingId, 
  });

  // Save ID
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      stripePaymentId: paymentIntent.id,
    },
  });

  return {
    clientSecret: paymentIntent.client_secret,
    amount: amountSubtotal,
    currency: PAYMENT_CONFIG.CURRENCY,
  };
}
