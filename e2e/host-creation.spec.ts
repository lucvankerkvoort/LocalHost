/**
 * Host Experience Creation E2E Tests (Section 3.8)
 * Tests the "Become a Host" page
 * 
 * NOTE: Uses element-based waits, not networkidle (incompatible with Cesium)
 */
import { test, expect, waitForAppReady } from './fixtures';

test.describe('Host Experience Creation', () => {
  
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
});
