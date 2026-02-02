---
description: Best practices for writing Playwright E2E tests for LocalHost (Cesium/WebGL app)
---

# Playwright E2E Testing for LocalHost

This skill documents best practices for writing Playwright end-to-end tests for LocalHost, a Next.js application with a Cesium/WebGL globe component.

## Critical: Cesium Compatibility

> **⚠️ NEVER use `waitForLoadState('networkidle')`**
> 
> Cesium continuously streams map tiles, so "network idle" will NEVER fire. Tests using this will timeout.

### Correct Wait Strategies

```typescript
// ❌ WRONG - will timeout forever
await page.goto('/');
await page.waitForLoadState('networkidle');

// ✅ CORRECT - wait for specific element
await page.goto('/');
await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 });

// ✅ ALSO CORRECT - use helper function
import { waitForAppReady } from './fixtures';
await page.goto('/');
await waitForAppReady(page);
```

## Test ID Conventions

Use `data-testid` attributes for reliable element selection:

| Element | Test ID |
|---------|---------|
| Chat toggle button | `chat-toggle` |
| User menu/profile | `user-menu` |
| Globe container | `globe-container` |
| Itinerary panel | `itinerary-panel` |
| Day card | `day-card` |

### Adding New Test IDs

When adding new testable elements:

```tsx
// In component
<button data-testid="my-button">Click me</button>

// In test
const button = page.locator('[data-testid="my-button"]');
await expect(button).toBeVisible();
```

## Fixture Usage

Import from `./fixtures` for all tests:

```typescript
import { 
  test, 
  expect, 
  waitForAppReady,
  waitForGlobe,
  waitForItinerary,
  openChat,
  sendChatMessage,
  waitForOrchestrator 
} from './fixtures';
```

### Mock Authentication

Use the `mockAuthPage` fixture for authenticated tests:

```typescript
test('authenticated flow', async ({ mockAuthPage: page }) => {
  await page.goto('/');
  // Session is mocked as authenticated
});
```

## Wait Patterns

### Page Load

```typescript
// For main app (has globe)
await page.goto('/');
await waitForAppReady(page);

// For specific elements
await expect(page.locator('[data-testid="itinerary-panel"]')).toBeVisible();
```

### After Actions

```typescript
// After clicking
await button.click();
await page.waitForTimeout(300); // For animations only

// For API-dependent UI
await page.waitForResponse('**/api/trips');
```

### AI/Orchestrator

```typescript
await sendChatMessage(page, 'Plan a trip to Paris');
await waitForOrchestrator(page, 90000); // Long timeout for AI
```

## Network Mocking

Mock APIs for isolated tests:

```typescript
await page.route('**/api/trips/**', async (route) => {
  await route.fulfill({
    status: 200,
    body: JSON.stringify({ trips: [] }),
  });
});
```

## Test Structure

```typescript
import { test, expect, waitForAppReady } from './fixtures';

test.describe('Feature Name', () => {
  
  test.beforeEach(async ({ mockAuthPage: page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('should do something', async ({ mockAuthPage: page }) => {
    // Test implementation
  });
});
```

## Common Issues

### Issue: Test times out on page.goto

**Cause**: Using `networkidle` or Cesium still loading  
**Fix**: Use `waitForAppReady(page)` instead

### Issue: Element not found

**Cause**: Missing test ID or wrong selector  
**Fix**: Add `data-testid` to component, use it in test

### Issue: Flaky tests

**Cause**: Race conditions with animations or API  
**Fix**: Use `expect(locator).toBeVisible()` which auto-waits

## Running Tests

```bash
# All tests
npx playwright test

# Specific file
npx playwright test auth.spec.ts

# With UI
npx playwright test --ui

# Debug mode
npx playwright test --debug

# Only Chromium
npx playwright test --project=chromium
```
