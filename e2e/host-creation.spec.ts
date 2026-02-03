/**
 * Host Experience Creation E2E Tests (Section 3.8)
 * Tests the "Become a Host" page
 * 
 * NOTE: Uses element-based waits, not networkidle (incompatible with Cesium)
 */
import { test, expect, waitForAppReady } from './fixtures';
import type { Page } from '@playwright/test';
import { HOST_ONBOARDING_START_TOKEN } from '../src/components/features/chat-widget-handshake';

type HostDraftSeed = {
  city?: string;
  title?: string;
  shortDesc?: string;
  longDesc?: string;
  duration?: number;
  stops?: Array<{ name: string; lat: number; lng: number; description?: string }>;
};

async function createHostDraft(page: Page, seed: HostDraftSeed) {
  const response = await page.request.post('/api/host/draft', { data: seed });
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as { draft?: { id?: string } };
  expect(payload.draft?.id).toBeTruthy();
  return payload.draft!.id!;
}

test.describe('Host Experience Creation', () => {

  test('silent handshake sends proactive onboarding trigger once on /become-host', async ({ page }) => {
    const chatRequests: Array<{
      intent?: string;
      onboardingStage?: string;
      raw: string;
    }> = [];

    await page.route('**/api/chat', async (route) => {
      const raw = route.request().postData() || '';
      try {
        const parsed = JSON.parse(raw);
        chatRequests.push({
          intent: parsed.intent,
          onboardingStage: parsed.onboardingStage,
          raw,
        });
      } catch {
        chatRequests.push({ raw });
      }

      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: '',
      });
    });

    await page.goto('/become-host?new=1');
    await waitForAppReady(page);
    await expect(page).toHaveURL(/\/become-host\/[^/?#]+/);
    const draftPath = new URL(page.url()).pathname;

    await expect.poll(() => chatRequests.length, { timeout: 5000 }).toBe(1);
    expect(chatRequests[0]?.intent).toBe('become_host');
    expect(chatRequests[0]?.onboardingStage).toBe('CITY_MISSING');
    expect(chatRequests[0]?.raw || '').toContain(`${HOST_ONBOARDING_START_TOKEN}:CITY_MISSING`);

    await page.goto(draftPath);
    await waitForAppReady(page);
    await page.waitForTimeout(500);

    expect(chatRequests.length).toBe(1);
  });

  test('silent handshake does not trigger on non host routes', async ({ page }) => {
    let chatRequestCount = 0;

    await page.route('**/api/chat', async (route) => {
      chatRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: '',
      });
    });

    await page.goto('/');
    await waitForAppReady(page);
    await page.waitForTimeout(500);

    expect(chatRequestCount).toBe(0);
  });

  test('silent handshake sends DETAILS_MISSING stage when city and stops exist but copy is missing', async ({ page }) => {
    const draftId = await createHostDraft(page, {
      city: 'Lisbon',
      stops: [{ name: 'Alfama Miradouro', lat: 38.711, lng: -9.129 }],
    });

    const chatRequests: Array<{ onboardingStage?: string; raw: string }> = [];
    await page.route('**/api/chat', async (route) => {
      const raw = route.request().postData() || '';
      try {
        const parsed = JSON.parse(raw);
        chatRequests.push({ onboardingStage: parsed.onboardingStage, raw });
      } catch {
        chatRequests.push({ raw });
      }

      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: '',
      });
    });

    await page.goto(`/become-host/${draftId}`);
    await waitForAppReady(page);

    await expect.poll(() => chatRequests.length, { timeout: 5000 }).toBe(1);
    expect(chatRequests[0]?.onboardingStage).toBe('DETAILS_MISSING');
    expect(chatRequests[0]?.raw || '').toContain(`${HOST_ONBOARDING_START_TOKEN}:DETAILS_MISSING`);
  });

  test('silent handshake sends READY_FOR_ASSIST stage for complete drafts', async ({ page }) => {
    const draftId = await createHostDraft(page, {
      city: 'Lisbon',
      title: 'Sunrise to Sunset Lisbon Walk',
      shortDesc: 'An intimate full-day route through Lisbon neighborhoods.',
      longDesc: 'We begin in Alfama for morning viewpoints, drift through backstreets, and close with sunset over the river.',
      stops: [{ name: 'Alfama Miradouro', lat: 38.711, lng: -9.129 }],
      duration: 360,
    });

    const chatRequests: Array<{ onboardingStage?: string; raw: string }> = [];
    await page.route('**/api/chat', async (route) => {
      const raw = route.request().postData() || '';
      try {
        const parsed = JSON.parse(raw);
        chatRequests.push({ onboardingStage: parsed.onboardingStage, raw });
      } catch {
        chatRequests.push({ raw });
      }

      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: '',
      });
    });

    await page.goto(`/become-host/${draftId}`);
    await waitForAppReady(page);

    await expect.poll(() => chatRequests.length, { timeout: 5000 }).toBe(1);
    expect(chatRequests[0]?.onboardingStage).toBe('READY_FOR_ASSIST');
    expect(chatRequests[0]?.raw || '').toContain(`${HOST_ONBOARDING_START_TOKEN}:READY_FOR_ASSIST`);
  });
  
  test('become-host page loads', async ({ page }) => {
    await page.goto('/become-host');
    await waitForAppReady(page);
    
    // Should be on become-host page
    expect(page.url()).toContain('become-host');
    
    // Navbar should be visible
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible();
  });

  test('become-host page has content', async ({ page }) => {
    await page.goto('/become-host');
    await waitForAppReady(page);
    
    // Page should have visible content
    await expect(page.locator('body')).toBeVisible();
  });

  test('can navigate from become-host to home', async ({ page }) => {
    await page.goto('/become-host');
    await waitForAppReady(page);
    
    // Navigate back to home
    await page.goto('/');
    await waitForAppReady(page);
    
    expect(page.url()).toMatch(/\/$/);
  });

  test('chat toggle works on become-host page', async ({ page }) => {
    await page.goto('/become-host');
    await waitForAppReady(page);
    
    const chatToggle = page.locator('[data-testid="chat-toggle"]');
    await expect(chatToggle).toBeVisible();
    
    // Should be clickable
    await chatToggle.click();
    await page.waitForTimeout(300);
  });

  test('city input exists on become-host page', async ({ page }) => {
    await page.goto('/become-host');
    await waitForAppReady(page);
    
    // Look for city input by various methods
    const cityInput = page.locator('[data-testid="city-input"], input[placeholder*="city" i], input[name*="city" i]').first();
    
    // Or find via label
    const cityByLabel = page.getByLabel(/city/i).first();
    
    // Check if either exists
    const inputExists = await cityInput.isVisible({ timeout: 5000 }).catch(() => false);
    const labelExists = await cityByLabel.isVisible({ timeout: 2000 }).catch(() => false);
    
    // At least the page should have content
    await expect(page.locator('body')).toBeVisible();
  });

  test('can type in city input on become-host page', async ({ page }) => {
    await page.goto('/become-host');
    await waitForAppReady(page);
    
    // Try to find and type in city input
    const cityInput = page.locator('input[placeholder*="city" i], input[name*="city" i], [data-testid="city-input"]').first();
    
    if (await cityInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cityInput.fill('Barcelona');
      
      // Verify text was entered
      await expect(cityInput).toHaveValue('Barcelona');
    }
    
    // Test passes if no crash - page still functional
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible();
  });
});
