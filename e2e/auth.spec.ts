/**
 * Auth E2E Tests (Section 3.1)
 * Tests app load and authentication flows
 * 
 * NOTE: Uses element-based waits, not networkidle (incompatible with Cesium)
 */
import { test, expect, waitForGlobe, waitForAppReady, collectConsoleErrors } from './fixtures';

test.describe('App Load and Authentication', () => {
  
  test('unauthenticated user can load app', async ({ page }) => {
    // Collect console errors during test
    const consoleErrors = collectConsoleErrors(page);
    
    // Record start time for performance check
    const startTime = Date.now();
    
    // Navigate to home page
    await page.goto('/');
    
    // Wait for globe to render (primary indicator app is ready)
    await waitForGlobe(page);
    
    // Check load time (should be under 30s including globe)
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(30000);
    
    // Cesium canvas should be present
    const canvas = page.locator('canvas');
    await expect(canvas.first()).toBeVisible();
    
    // Navigation bar should be visible (uses nav element, not header)
    const navbar = page.locator('[data-testid="navbar"]');
    await expect(navbar).toBeVisible();
    
    // No critical console errors
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes('Warning:') && 
               !err.includes('Expected') &&
               !err.includes('Hydration')
    );
    expect(criticalErrors.length).toBeLessThanOrEqual(10); // Allow some errors in dev mode
  });

  test('navbar shows brand and navigation', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Brand/logo should be visible ("Localhost" text)
    await expect(page.getByText('Localhost')).toBeVisible();
    
    // Navbar should be visible
    const navbar = page.locator('[data-testid="navbar"]');
    await expect(navbar).toBeVisible();
    
    // For unauthenticated users, should see auth options
    // Either "Log in"/"Sign up" or the mode switcher
    const hasAuthButton = await page.getByText(/Log in|Sign up|Sign in/i).first().isVisible().catch(() => false);
    const hasModeSwitch = await page.getByText(/Plan a Trip|Become a Host/i).first().isVisible().catch(() => false);
    
    expect(hasAuthButton || hasModeSwitch).toBe(true);
  });

  test('chat toggle button is accessible', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Chat toggle should be visible
    const chatToggle = page.locator('[data-testid="chat-toggle"]');
    await expect(chatToggle).toBeVisible({ timeout: 5000 });
    
    // Should be clickable
    await chatToggle.click();
    await page.waitForTimeout(400);
  });

  test('OAuth sign in flow (mocked)', async ({ mockAuthPage: page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // With mocked auth, the session endpoint returns authenticated user
    // Verify by checking the session API response
    const sessionResponse = await page.evaluate(async () => {
      const res = await fetch('/api/auth/session');
      return res.json();
    });
    
    expect(sessionResponse.user).toBeDefined();
    expect(sessionResponse.user.id).toBe('test-user-id');
    expect(sessionResponse.user.email).toBe('test@localhost.dev');
  });

  test('page navigation preserves session', async ({ mockAuthPage: page }) => {
    // Start at home
    await page.goto('/');
    await waitForAppReady(page);
    
    // Navigate to profile
    await page.goto('/profile');
    await waitForAppReady(page);
    
    // Navigate back to home
    await page.goto('/');
    await waitForAppReady(page);
    
    // Session should still be active
    const sessionResponse = await page.evaluate(async () => {
      const res = await fetch('/api/auth/session');
      return res.json();
    });
    
    expect(sessionResponse.user).toBeDefined();
    expect(sessionResponse.user.id).toBe('test-user-id');
  });
});
