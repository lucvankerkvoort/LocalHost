# Technical Spec — E2E Test Gap Closure

Date: 2026-02-02  
Author: Architect  
Scope: E2E Playwright test expansion to close critical coverage gaps

---

## 1. Scope

### Included

- Add Playwright E2E tests for flows currently untested or surface-level only
- Target 5 specific gap areas identified in analysis
- All tests must pass in both `npx playwright test` and `npx playwright test --ui`

### Excluded

- Unit tests (covered by existing test-specification.md)
- Integration tests (covered by existing test-specification.md)
- Modifications to production code
- New test infrastructure beyond existing `e2e/fixtures.ts`

---

## 2. Current State

### Existing Test Coverage

| Spec File | Tests | Coverage Level |
|-----------|-------|----------------|
| `auth.spec.ts` | 5 | Solid |
| `booking.spec.ts` | 3 | Surface-only: verifies panel appears, not booking flow |
| `trip-creation.spec.ts` | 5 | Solid via demo path |
| `itinerary-editing.spec.ts` | 4 | Surface-only: click-no-crash, no edit/delete |
| `persona-switching.spec.ts` | 4 | Solid |
| `host-creation.spec.ts` | 4 | Surface-only: page loads, no form input |
| `messaging.spec.ts` | 3 | Surface-only: toggle exists, no send/receive |
| `error-handling.spec.ts` | 3 | Solid |

**Total: 31 tests**

### Existing Fixtures (must not change)

File: [e2e/fixtures.ts](file:///Users/lucvankerkvoort/Documents/LocalHost/e2e/fixtures.ts)

- `mockAuthPage` — Page with mocked `/api/auth/session`
- `waitForAppReady(page)` — Wait for canvas/main content
- `waitForGlobe(page)` — Wait for Cesium globe
- `waitForItinerary(page)` — Wait for itinerary panel
- `openChat(page)` — Open chat widget
- `sendChatMessage(page, msg)` — Send message
- `waitForOrchestrator(page)` — Wait for AI response

### Known Constraints (must not violate)

1. **Cesium streams tiles continuously** — `waitForLoadState('networkidle')` will timeout
2. **AI responses are non-deterministic** — Cannot assert exact content
3. **Demo data path is deterministic** — Use "Load Demo" for predictable state

### Dependencies

- Playwright config at [playwright.config.ts](file:///Users/lucvankerkvoort/Documents/LocalHost/playwright.config.ts)
- WebServer auto-starts `npm run dev` on port 3000
- Chromium-only project

---

## 3. Desired Behavior

### 3.1 Booking Dialog Tests (booking.spec.ts)

**Add 3 tests:**

| Test | Action | Expected |
|------|--------|----------|
| Booking button opens dialog | Click "Book" on itinerary item | Dialog visible with candidate data |
| Dialog shows experience details | View dialog content | Experience title, host name, price visible |
| Cancel button closes dialog | Click "Cancel" | Dialog dismissed |

**Data Flow:**
1. Load demo data
2. Locate itinerary item with `data-testid="day-card"`
3. Find "Book" button within item
4. Click → assert dialog visible
5. Assert content present
6. Click cancel → assert dialog hidden

### 3.2 Itinerary Editing Tests (itinerary-editing.spec.ts)

**Add 2 tests:**

| Test | Action | Expected |
|------|--------|----------|
| Item has edit button | Hover/inspect item | Edit button visible |
| Item has delete button | Hover/inspect item | Delete button visible |

**Note:** Actual edit/delete operations require API mocking. These tests verify UI affordances exist.

### 3.3 Chat Message Send Test (messaging.spec.ts)

**Add 1 test:**

| Test | Action | Expected |
|------|--------|----------|
| Can send chat message | Type + submit | Input clears, API called |

**Mocking Required:**
```typescript
await page.route('**/api/orchestrator', async (route) => {
  await route.fulfill({
    status: 200,
    body: JSON.stringify({ success: true, response: 'Mocked response' })
  });
});
```

### 3.4 Host Creation Form Test (host-creation.spec.ts)

**Add 2 tests:**

| Test | Action | Expected |
|------|--------|----------|
| City input exists | View become-host page | City input visible |
| Can type in city input | Type "Barcelona" | Input contains text |

### 3.5 Profile Page Test (NEW FILE: profile.spec.ts)

**Add 2 tests:**

| Test | Action | Expected |
|------|--------|----------|
| Profile page loads for auth user | Navigate to /profile | Page renders |
| Create Host Profile link exists | View profile | Link to /become-host visible |

---

## 4. Constraints (Non-Negotiable)

### Files That MUST NOT Change

- `e2e/fixtures.ts` — Add new helpers only, do not modify existing
- `playwright.config.ts` — No changes
- Any file in `src/` — This is a test-only spec

### Patterns That MUST Be Used

- All element selection via `data-testid` or `getByRole` / `getByText`
- All waits via `expect(locator).toBeVisible()` or `page.waitForResponse()`
- Test timeout override via `test.setTimeout()` not config change

### Patterns That MUST Be Avoided

- `waitForLoadState('networkidle')` — Will timeout due to Cesium
- `waitForTimeout()` > 500ms — Arbitrary delays cause flakiness
- Hardcoded sleep for AI responses — Use `waitForOrchestrator()`

### Selector Rules

- Prefer: `[data-testid="..."]`
- Fallback: `getByRole('button', { name: '...' })`
- Avoid: CSS class selectors, XPath

---

## 5. Interfaces & Contracts

### Test IDs Required (already exist)

| Element | Test ID |
|---------|---------|
| Navbar | `navbar` |
| Globe container | `globe-container` |
| Chat toggle | `chat-toggle` |
| Itinerary panel | `itinerary-panel` |
| Day card | `day-card` |

### Test IDs Required (may need addition)

| Element | Proposed Test ID | File |
|---------|------------------|------|
| Booking dialog | `booking-dialog` | `booking-dialog.tsx` |
| Item edit button | `item-edit-button` | `itinerary-item.tsx` |
| Item delete button | `item-delete-button` | `itinerary-item.tsx` |
| City input | `city-input` | TBD |

> **Note:** If test IDs do not exist, the implementer MUST add them before writing tests. This is the only production code change allowed.

### API Mocking Contracts

**Orchestrator Mock:**
```typescript
// POST /api/orchestrator
{
  success: true,
  session: { id: 'mock-session' },
  response: 'Mocked AI response',
  plan: null
}
```

**Auth Session Mock (existing):**
```typescript
// GET /api/auth/session
{
  user: { id: 'test-user-id', name: 'Test User', email: 'test@localhost.dev' },
  expires: '...'
}
```

---

## 6. Testing Requirements

### All Tests MUST

1. Pass with `npx playwright test`
2. Pass with `npx playwright test --ui`
3. Complete within default timeout (30s) or explicit `test.setTimeout()`
4. Use existing fixtures from `e2e/fixtures.ts`
5. Have descriptive names matching pattern: `verb + subject + outcome`

### Flakiness Prevention

- No arbitrary `waitForTimeout()` calls
- All assertions use `expect(locator).toBeVisible({ timeout: T })`
- Mock external APIs (AI, Stripe) for determinism

### Acceptance Criteria

| Criterion | Pass Condition |
|-----------|----------------|
| Booking dialog test added | 3 new tests in `booking.spec.ts` |
| Itinerary edit/delete buttons tested | 2 new tests in `itinerary-editing.spec.ts` |
| Chat message send tested | 1 new test in `messaging.spec.ts` |
| Host creation form tested | 2 new tests in `host-creation.spec.ts` |
| Profile page tested | 2 new tests in `profile.spec.ts` (new file) |
| All tests pass headless | `npx playwright test` returns 0 |
| All tests pass UI mode | `npx playwright test --ui` returns 0 |

---

## 7. Out-of-Scope

### Intentionally Deferred

| Item | Reason |
|------|--------|
| Drag-and-drop tests | High flake risk; requires DnD-specific patterns |
| Full payment flow | Requires Stripe test environment setup |
| AI-generated content assertions | Non-deterministic; test structure only |
| Mobile viewport tests | Desktop-first; mobile is separate effort |
| Cross-browser testing | Current config is Chromium-only by design |

### Refactors NOT Permitted

- Do not modify component structure
- Do not add new test infrastructure
- Do not change Playwright config settings

---

## Appendix: File Locations

### Tests to Modify

- `e2e/booking.spec.ts` — Add 3 tests
- `e2e/itinerary-editing.spec.ts` — Add 2 tests
- `e2e/messaging.spec.ts` — Add 1 test
- `e2e/host-creation.spec.ts` — Add 2 tests

### Tests to Create

- `e2e/profile.spec.ts` — New file, 2 tests

### Production Files (test ID additions only)

- `src/components/features/booking-dialog.tsx` — Add `data-testid="booking-dialog"`
- `src/components/features/itinerary-item.tsx` — Add `data-testid="item-edit-button"`, `data-testid="item-delete-button"`

---

## Rollback Plan

If tests cause issues:
1. Remove new tests from spec files
2. Delete `e2e/profile.spec.ts`
3. Revert any `data-testid` additions

No database or state changes; rollback is file-level only.
