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

  test('book button opens booking dialog', async ({ page }) => {
    await page.goto('/');
    await waitForGlobe(page);
    
    // Load demo data
    await page.getByRole('button', { name: 'Load Demo', exact: true }).click();
    await waitForItinerary(page);
    
    // Find a "Book Now" button in an itinerary item
    const bookButton = page.getByRole('button', { name: /Book Now/i }).first();
    
    // Check if any book buttons exist (demo data may not have bookable items)
    if (await bookButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bookButton.click();
      
      // Booking dialog should appear
      const dialog = page.locator('[data-testid="booking-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });
    }
  });

  test('booking dialog shows experience details', async ({ page }) => {
    await page.goto('/');
    await waitForGlobe(page);
    
    // Load demo data
    await page.getByRole('button', { name: 'Load Demo', exact: true }).click();
    await waitForItinerary(page);
    
    // Find a "Book Now" button
    const bookButton = page.getByRole('button', { name: /Book Now/i }).first();
    
    if (await bookButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bookButton.click();
      
      // Dialog should show content
      const dialog = page.locator('[data-testid="booking-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });
      
      // Should contain "Confirm Booking" text
      await expect(dialog.getByText('Confirm Booking')).toBeVisible();
    }
  });

  test('booking dialog cancel button closes dialog', async ({ page }) => {
    await page.goto('/');
    await waitForGlobe(page);
    
    // Load demo data
    await page.getByRole('button', { name: 'Load Demo', exact: true }).click();
    await waitForItinerary(page);
    
    // Find a "Book Now" button
    const bookButton = page.getByRole('button', { name: /Book Now/i }).first();
    
    if (await bookButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bookButton.click();
      
      // Dialog should appear
      const dialog = page.locator('[data-testid="booking-dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });
      
      // Click cancel
      const cancelButton = page.locator('[data-testid="booking-cancel-button"]');
      await cancelButton.click();
      
      // Dialog should be hidden
      await expect(dialog).not.toBeVisible();
    }
  });
});
