/**
 * Error Handling E2E Tests (Section 3.7)
 * Tests graceful error handling
 * 
 * NOTE: Uses element-based waits, not networkidle (incompatible with Cesium)
 */
import { test, expect, waitForAppReady } from './fixtures';

test.describe('Error Handling', () => {
  
  test('app loads with API errors', async ({ page }) => {
    // Block some API endpoints
    await page.route('**/api/trips/**', async (route) => {
      await route.fulfill({ status: 500, body: '{}' });
    });
    
    await page.goto('/');
    await waitForAppReady(page);
    
    // App should still load - check for navbar
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible();
  });

  test('404 page or redirect works', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz-123');
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    
    // Should either show something or redirect
    // Just verify page doesn't crash
    await page.waitForTimeout(1000);
  });

  test('page refresh works', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Refresh
    await page.reload();
    await waitForAppReady(page);
    
    // App should still work - check navbar
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible();
  });
});
