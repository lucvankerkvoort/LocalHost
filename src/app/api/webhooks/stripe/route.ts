import { stripe } from '@/lib/stripe/stripe';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error: any) {
    console.error('Webhook signature verification failed.', error.message);
    return NextResponse.json({ error: 'Webhook signature verification failed.' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        // Update user status based on account details
        // We reuse the logic from connect.ts but here we just triggering it based on event
        // Ideally we call the same shared function
        
        // Find user by stripeConnectedAccountId
        const user = await prisma.user.findFirst({
          where: { stripeConnectedAccountId: account.id },
        });

        if (user) {
           const payoutsEnabled = account.payouts_enabled;
           const chargesEnabled = account.charges_enabled;
           let status = 'PENDING';
           if (payoutsEnabled && chargesEnabled && account.details_submitted) {
             status = 'COMPLETE';
           } else if (account.requirements?.disabled_reason) {
             status = 'RESTRICTED';
           }

           await prisma.user.update({
             where: { id: user.id },
             data: {
               payoutsEnabled,
               chargesEnabled,
               stripeOnboardingStatus: status as any,
             },
           });
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata.bookingId;

        if (bookingId) {
          // Calculate payout eligibility date (e.g. 24h after start)
          const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
          let payoutEligibleAt = new Date();
          
          if (booking) {
             // Default to 24h after booking.date (or start time)
             // booking.date is DateTime.
             const eligibleDate = new Date(booking.date);
             eligibleDate.setHours(eligibleDate.getHours() + 24);
             payoutEligibleAt = eligibleDate;
          }

          await prisma.booking.update({
            where: { id: bookingId },
            data: {
              status: 'CONFIRMED',
              paymentStatus: 'PAID',
              payoutStatus: 'ELIGIBLE', // For MVP, we mark eligible immediately or logic above
              payoutEligibleAt: payoutEligibleAt,
            },
          });
          
          await prisma.paymentEvent.create({
            data: {
              bookingId,
              type: 'PAYMENT_SUCCEEDED',
              payload: JSON.parse(JSON.stringify(paymentIntent)),
            },
          });
        }
        break;
      }
      
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata.bookingId;
        if (bookingId) {
          await prisma.booking.update({
             where: { id: bookingId },
             data: { paymentStatus: 'FAILED' }
          });
        }
        break;
      }
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
