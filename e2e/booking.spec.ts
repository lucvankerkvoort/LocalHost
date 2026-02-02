/**
 * Booking Flow E2E Tests (Section 3.5)
 * Tests booking-related UI elements
 * 
 * NOTE: Full booking flow requires Stripe integration
 * Uses element-based waits, not networkidle (incompatible with Cesium)
 */
import { test, expect, waitForGlobe, waitForItinerary } from './fixtures';

test.describe('Booking Flow', () => {
  
  // Increase timeout for tests that load demo data
  test.setTimeout(60000);

  test('itinerary panel appears after loading demo', async ({ page }) => {
    await page.goto('/');
    await waitForGlobe(page);
    
    // Load demo data
    await page.getByRole('button', { name: 'Load Demo', exact: true }).click();
    
    // Wait for itinerary
    await waitForItinerary(page);
    
    // Panel should be visible
    const panel = page.locator('[data-testid="itinerary-panel"]');
    await expect(panel).toBeVisible();
  });

  test('day cards are visible after demo load', async ({ page }) => {
    await page.goto('/');
    await waitForGlobe(page);
    
    // Load demo data
    await page.getByRole('button', { name: 'Load Demo', exact: true }).click();
    await waitForItinerary(page);
    
    const dayCards = page.locator('[data-testid="day-card"]');
    await expect(dayCards.first()).toBeVisible();
  });

  test('day cards respond to click', async ({ page }) => {
    await page.goto('/');
    await waitForGlobe(page);
    
    // Load demo data
    await page.getByRole('button', { name: 'Load Demo', exact: true }).click();
    await waitForItinerary(page);
    
    const dayCards = page.locator('[data-testid="day-card"]');
    
    if (await dayCards.count() > 0) {
      const firstDay = dayCards.first();
      await firstDay.click();
      
      // Should not cause error - verify navbar still visible
      await page.waitForTimeout(200);
      await expect(page.locator('[data-testid="navbar"]')).toBeVisible();
    }
  });
});
