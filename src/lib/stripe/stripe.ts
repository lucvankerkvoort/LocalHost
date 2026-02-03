import Stripe from 'stripe';

// Use a placeholder if missing (for build time), but warn.
const apiKey = process.env.STRIPE_SECRET_KEY || 'stripe_key_placeholder_for_build';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY is missing in environment variables. Using placeholder for build.');
}

export const stripe = new Stripe(apiKey, {
  // The error said `2025-01-27.acacia` is not assignable to `2026-01-28.clover`. 
  // This means the SDK wants `2026-01-28.clover`.
  apiVersion: '2026-01-28.clover' as any, 
  typescript: true,
});

export const PAYMENT_CONFIG = {
  CURRENCY: 'usd',
  PAYOUT_DELAY_HOURS: 24, // Hold funds for 24h after experience start
  PLATFORM_FEE_PERCENT: 0.1, // 10% Platform Fee
};
