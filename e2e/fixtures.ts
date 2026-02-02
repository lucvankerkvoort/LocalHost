/**
 * E2E Fixtures for LocalHost tests
 * Extends Playwright with app-specific fixtures and helpers
 * 
 * IMPORTANT: This app uses Cesium/WebGL for the globe, which continuously
 * streams map tiles. DO NOT use waitForLoadState('networkidle') as it will
 * never resolve. Use element-based waits instead.
 */
import { test as base, expect, Page } from '@playwright/test';

// Define custom fixture types
type LocalHostFixtures = {
  /** Authenticated page with session */
  authenticatedPage: Page;
  /** Page with mock auth for testing */
  mockAuthPage: Page;
};

/**
 * Extended test with LocalHost fixtures
 */
export const test = base.extend<LocalHostFixtures>({
  // Authenticated page fixture
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/');
    await waitForAppReady(page);
    await use(page);
  },
  
  // Mock auth page for testing without real OAuth
  mockAuthPage: async ({ page }, use) => {
    // Intercept auth session endpoint to return authenticated user
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            email: 'test@localhost.dev',
            image: null,
          },
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
    });
    
    await use(page);
  },
});

export { expect };

// =============================================================================
// WAIT HELPERS - Use these instead of waitForLoadState('networkidle')
// =============================================================================

/**
 * Wait for the app to be ready (globe canvas rendered)
 * This is the PRIMARY wait function for page loads.
 */
export async function waitForAppReady(page: Page, timeout = 30000) {
  // Wait for either:
  // 1. Globe canvas to appear (main app view)
  // 2. OR page content to load (for non-globe pages)
  await expect(
    page.locator('[data-testid="globe-container"] canvas, canvas, main, [data-testid="page-content"]').first()
  ).toBeVisible({ timeout });
}

/**
 * Wait for globe component specifically
 * Use when you need the 3D globe to be interactive
 */
export async function waitForGlobe(page: Page, timeout = 20000) {
  // Wait for the globe container's canvas element
  await expect(
    page.locator('[data-testid="globe-container"] canvas, canvas').first()
  ).toBeVisible({ timeout });
  
  // Small delay for Cesium to initialize rendering pipeline
  await page.waitForTimeout(500);
}

/**
 * Wait for itinerary panel to be visible
 */
export async function waitForItinerary(page: Page, timeout = 15000) {
  await expect(
    page.locator('[data-testid="itinerary-panel"]')
  ).toBeVisible({ timeout });
}

// =============================================================================
// INTERACTION HELPERS
// =============================================================================

/**
 * Open the chat widget
 */
export async function openChat(page: Page) {
  const chatButton = page.locator('[data-testid="chat-toggle"]');
  
  // Wait for button to be ready
  await expect(chatButton).toBeVisible({ timeout: 10000 });
  
  // Click to open
  await chatButton.click();
  
  // Wait for chat to animate open
  await page.waitForTimeout(300);
}

/**
 * Send a chat message
 */
export async function sendChatMessage(page: Page, message: string) {
  // Find chat input - try multiple selectors
  const input = page.locator('[data-testid="chat-input"], input[placeholder*="message" i], textarea[placeholder*="message" i]').first();
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill(message);
  
  // Find and click send button
  const sendButton = page.locator('[data-testid="chat-send"], button[type="submit"], button:has-text("Send")').first();
  await sendButton.click();
}

/**
 * Wait for AI orchestrator to complete processing
 * Uses response-based waiting instead of arbitrary timeouts
 */
export async function waitForOrchestrator(page: Page, timeout = 90000) {
  // Wait for orchestrator API response
  try {
    await page.waitForResponse(
      (response) => 
        response.url().includes('/api/orchestrator') && 
        response.status() === 200,
      { timeout }
    );
  } catch {
    // Response might have already completed, continue
  }
  
  // Wait for any loading indicators to disappear
  const loadingIndicator = page.locator('[data-testid="orchestrator-loading"], [aria-busy="true"], .loading-spinner');
  
  try {
    // If loading is visible, wait for it to hide
    if (await loadingIndicator.isVisible()) {
      await loadingIndicator.waitFor({ state: 'hidden', timeout: timeout });
    }
  } catch {
    // Loading may have already completed
  }
  
  // Small settle time for UI updates
  await page.waitForTimeout(300);
}

// =============================================================================
// NAVIGATION HELPERS
// =============================================================================

/**
 * Navigate to a page and wait for it to be ready
 */
export async function navigateAndWait(page: Page, path: string, timeout = 30000) {
  await page.goto(path);
  await waitForAppReady(page, timeout);
}

/**
 * Navigate to home and wait for globe
 */
export async function goToHome(page: Page) {
  await page.goto('/');
  await waitForGlobe(page);
}

// =============================================================================
// ASSERTION HELPERS
// =============================================================================

/**
 * Check for console errors during test
 * Returns array of error messages
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter out known non-critical errors
      if (!text.includes('Warning:') && 
          !text.includes('React DevTools') &&
          !text.includes('third-party cookie')) {
        errors.push(text);
      }
    }
  });
  
  return errors;
}

/**
 * Assert that a page loaded without critical errors
 */
export async function assertNoPageErrors(page: Page, errors: string[]) {
  // Filter for truly critical errors
  const criticalErrors = errors.filter(
    (err) => !err.includes('Expected') && !err.includes('Hydration')
  );
  expect(criticalErrors).toHaveLength(0);
}
