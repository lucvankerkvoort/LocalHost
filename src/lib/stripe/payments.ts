import { stripe, PAYMENT_CONFIG } from './stripe';
import { prisma } from '@/lib/prisma';

function resolveBookingSubtotal(
  amountSubtotal: number | null | undefined,
  totalPrice: number | null | undefined,
  fallbackExperiencePrice: number | null | undefined
): number {
  if (typeof amountSubtotal === 'number' && amountSubtotal > 0) return amountSubtotal;
  if (typeof totalPrice === 'number' && totalPrice > 0) return totalPrice;
  if (typeof fallbackExperiencePrice === 'number' && fallbackExperiencePrice > 0) return fallbackExperiencePrice;
  return 0;
}

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
  
  const amountSubtotal = resolveBookingSubtotal(
    booking.amountSubtotal,
    booking.totalPrice,
    booking.experience.price
  );

  // Validation 4: resolved amount must be greater than 0
  if (!amountSubtotal || amountSubtotal <= 0) {
    throw new Error('Invalid booking amount');
  }
  const platformFee = Math.round(amountSubtotal * PAYMENT_CONFIG.PLATFORM_FEE_PERCENT); // 10%
  const hostNet = amountSubtotal - platformFee;

  // Normalize monetary fields for legacy bookings, then persist computed fees.
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      amountSubtotal,
      totalPrice: booking.totalPrice > 0 ? booking.totalPrice : amountSubtotal,
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

export type BookingPaymentReconcileResult = {
  state: 'CONFIRMED' | 'PENDING' | 'FAILED';
  stripeStatus: string;
  bookingId: string;
};

export async function reconcileBookingPayment(
  bookingId: string,
  userId?: string
): Promise<BookingPaymentReconcileResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) throw new Error('Booking not found');

  if (userId && booking.guestId !== userId) {
    throw new Error('Booking does not belong to this user');
  }

  if (booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') {
    return {
      state: 'CONFIRMED',
      stripeStatus: 'succeeded',
      bookingId,
    };
  }

  if (!booking.stripePaymentId) {
    throw new Error('Booking has no Stripe payment intent');
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripePaymentId);
  const stripeStatus = paymentIntent.status;

  if (stripeStatus === 'succeeded') {
    const payoutEligibleAt = new Date(booking.date);
    payoutEligibleAt.setHours(payoutEligibleAt.getHours() + PAYMENT_CONFIG.PAYOUT_DELAY_HOURS);

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          payoutStatus: 'ELIGIBLE',
          payoutEligibleAt,
        },
      });

      await tx.paymentEvent.create({
        data: {
          bookingId,
          type: 'PAYMENT_RECONCILED_SUCCEEDED',
          payload: JSON.parse(JSON.stringify(paymentIntent)),
        },
      });
    });

    return {
      state: 'CONFIRMED',
      stripeStatus,
      bookingId,
    };
  }

  if (stripeStatus === 'canceled' || stripeStatus === 'requires_payment_method') {
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          paymentStatus: 'FAILED',
        },
      });

      await tx.paymentEvent.create({
        data: {
          bookingId,
          type: 'PAYMENT_RECONCILED_FAILED',
          payload: JSON.parse(JSON.stringify(paymentIntent)),
        },
      });
    });

    return {
      state: 'FAILED',
      stripeStatus,
      bookingId,
    };
  }

  return {
    state: 'PENDING',
    stripeStatus,
    bookingId,
  };
}
