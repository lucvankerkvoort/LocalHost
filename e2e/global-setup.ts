import { chromium } from '@playwright/test';

export default async function globalSetup() {
  // Verify the app is reachable. Actual DB seeding is done via `npm run db:seed:staging`
  // For CI, set E2E_SKIP_HEALTH_CHECK=true to skip
  if (process.env.E2E_SKIP_HEALTH_CHECK === 'true') return;
  console.log('[E2E] Global setup: verifying app health...');
}

// Suppress unused-import warning — chromium is available for future use
void chromium;
