/**
 * Persona Switching E2E Tests (Section 3.4)
 * Tests navigation between different app modes
 * 
 * NOTE: Uses element-based waits, not networkidle (incompatible with Cesium)
 */
import { test, expect, waitForAppReady } from './fixtures';

test.describe('Persona Switching and Navigation', () => {
  
  test('can navigate to become-host page', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Direct navigation to become-host
    await page.goto('/become-host');
    await waitForAppReady(page);
    
    // Should be on become-host page
    expect(page.url()).toContain('become-host');
  });

  test('can navigate back to home from become-host', async ({ page }) => {
    // Start on become-host
    await page.goto('/become-host');
    await waitForAppReady(page);
    
    // Navigate to home
    await page.goto('/');
    await waitForAppReady(page);
    
    // Should be on home
    expect(page.url()).toMatch(/\/$/);
  });

  test('navbar is present on all pages', async ({ page }) => {
    // Check home
    await page.goto('/');
    await waitForAppReady(page);
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible();
    
    // Check become-host
    await page.goto('/become-host');
    await waitForAppReady(page);
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible();
    
    // Check profile
    await page.goto('/profile');
    await waitForAppReady(page);
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible();
  });

  test('chat toggle is accessible on multiple pages', async ({ page }) => {
    // Test on home
    await page.goto('/');
    await waitForAppReady(page);
    
    const chatToggle = page.locator('[data-testid="chat-toggle"]');
    await expect(chatToggle).toBeVisible();
    
    // Navigate and check again
    await page.goto('/become-host');
    await waitForAppReady(page);
    
    await expect(chatToggle).toBeVisible();
  });
});
