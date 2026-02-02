import { stripe } from './stripe';
import { prisma } from '@/lib/prisma';

export async function releasePayout(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      experience: { include: { host: true } },
    },
  });

  if (!booking) throw new Error('Booking not found');
  if (!booking.experience.host.stripeConnectedAccountId) {
    throw new Error('Host has no connected Stripe account');
  }
  if (booking.payoutStatus === 'RELEASED') {
    throw new Error('Payout already released');
  }
  if (booking.paymentStatus !== 'PAID') {
    throw new Error('Booking not paid');
  }

  const hostAccountId = booking.experience.host.stripeConnectedAccountId;
  const amount = booking.hostNetAmount;

  // Create Transfer
  const transfer = await stripe.transfers.create({
    amount: amount,
    currency: booking.currency.toLowerCase(),
    destination: hostAccountId,
    transfer_group: bookingId, // Link to the original payment group where possible
    metadata: {
      bookingId: booking.id,
      type: 'EXPERIENCE_PAYOUT',
    },
  });

  // Update DB
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      payoutStatus: 'RELEASED',
      stripeTransferId: transfer.id,
    },
  });
  
  // Log event
  await prisma.paymentEvent.create({
    data: {
      bookingId: booking.id,
      type: 'PAYOUT_RELEASED',
      payload: JSON.parse(JSON.stringify(transfer)),
    },
  });

  return transfer;
}
