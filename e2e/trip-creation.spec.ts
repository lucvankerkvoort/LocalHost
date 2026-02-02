/**
 * Trip Creation E2E Tests (Section 3.2)
 * Tests trip creation via chat and itinerary hydration
 * 
 * NOTE: Uses element-based waits, not networkidle (incompatible with Cesium)
 */
import { test, expect, waitForGlobe, waitForItinerary, openChat } from './fixtures';

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
    const chatToggle = page.locator('[data-testid="chat-toggle"]');
    await expect(chatToggle).toBeVisible();
    await expect(chatToggle).toBeEnabled();
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
});
