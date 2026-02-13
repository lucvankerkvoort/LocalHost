import Stripe from 'stripe';

// Use a placeholder if missing (for build time), but warn.
const apiKey = process.env.STRIPE_SECRET_KEY || 'stripe_key_placeholder_for_build';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY is missing in environment variables. Using placeholder for build.');
}

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2026-01-28.clover';

export const stripe = new Stripe(apiKey, {
  apiVersion: STRIPE_API_VERSION,
  typescript: true,
});

export const PAYMENT_CONFIG = {
  CURRENCY: 'usd',
  PAYOUT_DELAY_HOURS: 24, // Hold funds for 24h after experience start
  PLATFORM_FEE_PERCENT: 0.1, // 10% Platform Fee
};
