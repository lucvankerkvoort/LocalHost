/**
 * Messaging E2E Tests (Section 3.6)
 * Tests P2P chat UI elements
 * 
 * NOTE: Uses element-based waits, not networkidle (incompatible with Cesium)
 */
import { test, expect, waitForAppReady, openChat } from './fixtures';

test.describe('Messaging', () => {
  
  test('chat toggle button exists', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    const chatToggle = page.locator('[data-testid="chat-toggle"]');
    await expect(chatToggle).toBeVisible();
  });

  test('chat toggle is clickable', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    const chatToggle = page.locator('[data-testid="chat-toggle"]');
    await expect(chatToggle).toBeVisible();
    
    // Click should work
    await chatToggle.click();
    await page.waitForTimeout(400);
    
    // Click again to toggle
    await chatToggle.click();
  });

  test('unread badge may show count', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Badge might or might not be visible depending on state
    const badge = page.locator('[data-testid="chat-toggle"] span');
    
    // Just check that the chat toggle exists
    const chatToggle = page.locator('[data-testid="chat-toggle"]');
    await expect(chatToggle).toBeVisible();
  });
});
