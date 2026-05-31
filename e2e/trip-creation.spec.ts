/**
 * Trip Creation E2E Tests (Section 3.2)
 * Tests trip creation via chat and itinerary hydration
 *
 * NOTE: Uses element-based waits, not networkidle (incompatible with Cesium)
 */
import { test, expect, waitForGlobe, waitForItinerary, mockChatAPI, mockOrchestratorAPI } from './fixtures';

test.describe('Trip Creation and Itinerary Hydration', () => {

  test('globe renders with canvas element', async ({ page }) => {
    await page.goto('/');
    await waitForGlobe(page);

    // Verify globe container exists
    const globeContainer = page.locator('[data-testid="globe-container"]');
    await expect(globeContainer).toBeVisible();

    // Verify canvas is inside
    const canvas = globeContainer.locator('canvas');
    await expect(canvas.first()).toBeVisible();
  });

  test('can access chat interface', async ({ page }) => {
    await page.goto('/');
    await waitForGlobe(page);

    // Chat toggle should be accessible
    const chatToggle = page.locator('[data-testid="chat-toggle"]').first();
    await expect(chatToggle).toBeVisible();
    await expect(chatToggle).toBeEnabled();
    await expect(chatToggle.locator('svg.lucide')).toBeVisible();
  });

  test('load demo button works', async ({ page }) => {
    await page.goto('/');
    await waitForGlobe(page);

    // Use exact match to avoid ambiguity with "Load Demo Data"
    const loadDemoButton = page.getByRole('button', { name: 'Load Demo', exact: true });
    await expect(loadDemoButton).toBeVisible({ timeout: 10000 });
    await loadDemoButton.click();

    // Wait for itinerary panel to appear
    await waitForItinerary(page);

    // Should see day cards
    const dayCards = page.locator('[data-testid="day-card"]');
    await expect(dayCards.first()).toBeVisible({ timeout: 10000 });
  });

  test('itinerary panel shows destination info after demo load', async ({ page }) => {
    await page.goto('/');
    await waitForGlobe(page);

    // Load demo data - use exact match
    await page.getByRole('button', { name: 'Load Demo', exact: true }).click();

    // Wait for itinerary
    await waitForItinerary(page);

    // Check for itinerary header
    const itineraryHeader = page.getByText('Your Itinerary');
    await expect(itineraryHeader).toBeVisible({ timeout: 10000 });
  });

  test('timeline toggle button exists', async ({ page }) => {
    await page.goto('/');
    await waitForGlobe(page);

    // Check for timeline toggle (may be hidden initially)
    // Load demo first to ensure timeline is shown
    await page.getByRole('button', { name: 'Load Demo', exact: true }).click();
    await waitForItinerary(page);

    const timelineButton = page.getByRole('button', { name: /Hide Timeline|Show Timeline/i });
    await expect(timelineButton).toBeVisible({ timeout: 10000 });
  });

  // -------------------------------------------------------------------------
  // New mocked AI scenarios
  // -------------------------------------------------------------------------

  test('with mocked AI: chat message triggers orchestrator', async ({ page }) => {
    // Mock session so the user is authenticated
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'e2e-traveler-full-access',
            email: 'traveler@e2e.localhost',
            name: 'Test Traveler',
            image: null,
          },
          expires: '2027-12-31T00:00:00.000Z',
        }),
      });
    });

    await mockChatAPI(page);
    await mockOrchestratorAPI(page);

    await page.goto('/');
    await waitForGlobe(page);

    // Open chat
    const chatToggle = page.locator('[data-testid="chat-toggle"]');
    await expect(chatToggle).toBeVisible({ timeout: 10000 });
    await chatToggle.click();
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible({ timeout: 5000 });

    // Track orchestrator calls
    const orchestratorCalled = page.waitForRequest(
      (req) => req.url().includes('/api/orchestrator'),
      { timeout: 15000 }
    );

    // Send a message that triggers itinerary generation
    await page.locator('[data-testid="chat-input"]').fill('Plan a 5-day trip to Tokyo');
    await page.locator('[data-testid="chat-send"]').click();

    // Verify orchestrator was called
    await orchestratorCalled;
  });

  test('with mocked AI: itinerary panel appears', async ({ page }) => {
    // Mock session
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'e2e-traveler-full-access',
            email: 'traveler@e2e.localhost',
            name: 'Test Traveler',
            image: null,
          },
          expires: '2027-12-31T00:00:00.000Z',
        }),
      });
    });

    await mockChatAPI(page);
    await mockOrchestratorAPI(page);

    await page.goto('/');
    await waitForGlobe(page);

    const chatToggle = page.locator('[data-testid="chat-toggle"]');
    await expect(chatToggle).toBeVisible({ timeout: 10000 });
    await chatToggle.click();
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="chat-input"]').fill('Plan a trip to Barcelona');
    await page.locator('[data-testid="chat-send"]').click();

    // Itinerary panel should appear after orchestrator completes
    await expect(
      page.locator('[data-testid="itinerary-panel"]')
    ).toBeVisible({ timeout: 15000 });
  });

  test('with mocked AI: day cards appear from mocked plan', async ({ page }) => {
    // Mock session
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'e2e-traveler-full-access',
            email: 'traveler@e2e.localhost',
            name: 'Test Traveler',
            image: null,
          },
          expires: '2027-12-31T00:00:00.000Z',
        }),
      });
    });

    await mockChatAPI(page);
    await mockOrchestratorAPI(page);

    await page.goto('/');
    await waitForGlobe(page);

    const chatToggle = page.locator('[data-testid="chat-toggle"]');
    await expect(chatToggle).toBeVisible({ timeout: 10000 });
    await chatToggle.click();
    await expect(page.locator('[data-testid="chat-input"]')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="chat-input"]').fill('Plan a trip to Barcelona');
    await page.locator('[data-testid="chat-send"]').click();

    // Wait for itinerary panel
    await expect(
      page.locator('[data-testid="itinerary-panel"]')
    ).toBeVisible({ timeout: 15000 });

    // Day cards should be rendered from the mocked plan
    await expect(
      page.locator('[data-testid="day-card"]').first()
    ).toBeVisible({ timeout: 10000 });
  });
});
