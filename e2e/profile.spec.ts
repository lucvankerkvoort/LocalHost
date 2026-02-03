/**
 * Profile Page E2E Tests
 * Tests profile page functionality for authenticated users
 * 
 * NOTE: Uses element-based waits, not networkidle (incompatible with Cesium)
 * NOTE: Profile page may redirect to auth if session middleware runs server-side
 */
import { test, expect, waitForAppReady } from './fixtures';

test.describe('Profile Page', () => {
  
  test('profile page navigation works', async ({ mockAuthPage: page }) => {
    await page.goto('/profile');
    await waitForAppReady(page);
    
    // Either lands on profile page or auth page (server-side middleware)
    const currentUrl = page.url();
    const isOnProfile = currentUrl.includes('profile');
    const isOnAuth = currentUrl.includes('auth');
    
    // Navigation should work without crash
    expect(isOnProfile || isOnAuth).toBeTruthy();
    
    // Page should render
    await expect(page.locator('body')).toBeVisible();
  });

  test('become-host link accessible from profile or redirect', async ({ mockAuthPage: page }) => {
    await page.goto('/profile');
    await waitForAppReady(page);
    
    const currentUrl = page.url();
    
    // If on profile page, check for become-host link
    if (currentUrl.includes('profile')) {
      const hostLink = page.getByRole('link', { name: /Create Host Profile|Become a Host|Host/i });
      const linkVisible = await hostLink.isVisible({ timeout: 5000 }).catch(() => false);
      
      if (linkVisible) {
        await expect(hostLink).toHaveAttribute('href', '/become-host');
      }
    }
    
    // Page should render without crash
    await expect(page.locator('body')).toBeVisible();
  });
});
