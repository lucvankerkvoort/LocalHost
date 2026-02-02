/**
 * Auth Setup - runs before all test projects
 * Verifies the app is accessible before running tests
 */
import { test as setup, expect } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  // Navigate to the app
  await page.goto('/');
  
  // Wait for canvas (globe) to appear - this confirms the app loaded
  // DO NOT use waitForLoadState('networkidle') - Cesium streams tiles continuously
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 });
  
  console.log('Auth setup complete - app is accessible');
});
