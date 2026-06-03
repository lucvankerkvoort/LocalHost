# PATTERNS.md — Approved Patterns

If the pattern is here, use it. If it's not, ask before inventing something new.

---

## Zod Validation

### Every API boundary must have a schema
Co-locate the schema with the route handler. Never accept untyped `req.json()`.

```typescript
// src/app/api/trips/route.ts
import { z } from 'zod';

const CreateTripSchema = z.object({
  title: z.string().min(1).max(100),
  startDate: z.string().datetime().optional(),
  cityIds: z.array(z.string().uuid()).min(1),
});

type CreateTripInput = z.infer<typeof CreateTripSchema>; // derive — don't duplicate

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateTripSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 });
  }
  // parsed.data is fully typed as CreateTripInput
}
```

### Shared schemas live in `src/types/` or `src/lib/ai/types.ts`
Only create an inline schema if it is genuinely only used in one route. If it's used in two places, move it.

### AI output schemas — always validate before touching state or DB
```typescript
import { DraftItinerarySchema } from '@/lib/ai/types';

const result = DraftItinerarySchema.safeParse(rawOutput);
if (!result.success) {
  // Return structured error — never silently ignore
  return { error: 'AI output schema mismatch', issues: result.error.issues };
}
const plan = result.data; // fully typed, guaranteed valid shape
```

### Response schemas — define and validate API responses too
```typescript
const TripResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: z.enum(['DRAFT', 'PLANNED', 'BOOKED', 'COMPLETED']),
  stops: z.array(TripStopSchema),
});

type TripResponse = z.infer<typeof TripResponseSchema>;
```

---

## TypeScript — Full Typing Rules

- **No `any`** — if you don't know the type, use `unknown` and narrow it.
- **No non-null assertions (`!`)** without an inline comment explaining why it's safe.
- **Derive types from schemas**: `type Foo = z.infer<typeof FooSchema>` — never write a parallel type manually.
- **Readonly for DB output**: data coming out of Prisma should be treated as `Readonly<T>` — don't mutate it directly.
- **Discriminated unions over boolean flags**:
  ```typescript
  // BAD
  type Result = { success: boolean; data?: Trip; error?: string };

  // GOOD
  type Result = { success: true; data: Trip } | { success: false; error: string };
  ```
- **Exhaustive switches** — use a `never` check at the end of switch statements over union types:
  ```typescript
  function assertNever(x: never): never {
    throw new Error(`Unhandled case: ${x}`);
  }
  ```

---

## TDD — Test-Driven Development

Write tests **before** implementation. Tests define the contract; implementation fulfills it.

### Order of operations
1. Write the test — it should fail (red).
2. Write the minimum implementation to make it pass (green).
3. Refactor if needed, keeping tests green.

### What to unit test
Unit test **pure logic** — reducers, converters, validators, utility functions:

```typescript
// src/lib/ai/__tests__/plan-converter.test.ts
import { convertPlanToGlobeData } from '../plan-converter';
import { mockItineraryPlan } from './__fixtures__/plans';

describe('convertPlanToGlobeData', () => {
  it('generates deterministic destination IDs', () => {
    const result = convertPlanToGlobeData(mockItineraryPlan);
    expect(result.destinations[0].id).toBe('day-1');
    expect(result.destinations[1].id).toBe('day-2');
  });

  it('preserves image URLs across re-applies', () => {
    const first = convertPlanToGlobeData(mockItineraryPlan);
    const second = convertPlanToGlobeData(mockItineraryPlan);
    expect(first.destinations[0].activities[0].imageUrl)
      .toBe(second.destinations[0].activities[0].imageUrl);
  });
});
```

### What to unit test — Redux reducers
```typescript
// src/store/__tests__/globe-slice.test.ts
import { globeSlice, setSelectedDestination } from '../globe-slice';

describe('globe reducer', () => {
  it('sets selectedDestination', () => {
    const state = globeSlice.reducer(undefined, setSelectedDestination('day-1'));
    expect(state.selectedDestination).toBe('day-1');
  });

  it('clears selectedDestination when set to null', () => {
    const initial = { ...globeSlice.getInitialState(), selectedDestination: 'day-1' };
    const state = globeSlice.reducer(initial, setSelectedDestination(null));
    expect(state.selectedDestination).toBeNull();
  });
});
```

### What to unit test — Zod schemas
```typescript
describe('CreateTripSchema', () => {
  it('rejects missing cityIds', () => {
    const result = CreateTripSchema.safeParse({ title: 'My Trip' });
    expect(result.success).toBe(false);
  });

  it('rejects empty cityIds array', () => {
    const result = CreateTripSchema.safeParse({ title: 'My Trip', cityIds: [] });
    expect(result.success).toBe(false);
  });
});
```

### Test file locations
```
src/
  lib/
    ai/
      __tests__/
        plan-converter.test.ts
        orchestrator.test.ts
    trips/
      __tests__/
        persistence.test.ts
        versioning.test.ts
  store/
    __tests__/
      globe-slice.test.ts
  app/
    api/
      trips/
        __tests__/
          route.test.ts
```

---

## Playwright — E2E Testing

Every user-facing flow must have a Playwright test. Tests live in `e2e/`.

### File naming convention
```
e2e/
  trip-planning.spec.ts      # Guest plans a trip
  host-creation.spec.ts      # Host creates an experience
  booking-flow.spec.ts       # Guest books an experience
  messaging.spec.ts          # Guest ↔ Host chat
  auth.spec.ts               # Login / signup
```

### Standard test structure
```typescript
// e2e/trip-planning.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Trip Planning', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Sign in via stored auth state or API
  });

  test('user can create a trip via chat', async ({ page }) => {
    // Arrange
    await page.getByPlaceholder('Where do you want to go?').fill('3 days in Lisbon');

    // Act
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid="itinerary-day"]', { timeout: 30_000 });

    // Assert
    const days = await page.locator('[data-testid="itinerary-day"]').all();
    expect(days.length).toBe(3);
  });

  test('user can add a day to an existing trip', async ({ page }) => {
    // ...
  });
});
```

### `data-testid` attributes are required
Any element that a Playwright test needs to interact with must have a `data-testid`:
```tsx
<div data-testid="itinerary-day" key={day.id}>
<button data-testid="book-experience-btn">Book</button>
<div data-testid="orchestrator-status">{status}</div>
```

Do not use CSS classes or text content as Playwright selectors — they break on style/copy changes.

### API mocking in E2E tests
Mock the orchestrator in E2E tests to avoid LLM costs and flakiness:
```typescript
await page.route('/api/orchestrator', async route => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(mockOrchestratorResponse),
  });
});
```

---

## State Management

### Reading Redux state in a component
```typescript
import { useAppSelector } from '@/store/hooks';
const tripId = useAppSelector(state => state.globe.tripId);
```

### Dispatching actions
```typescript
import { useAppDispatch } from '@/store/hooks';
const dispatch = useAppDispatch();
dispatch(setSelectedDestination(id));
```

### Adding a new slice
1. Create `src/store/[domain]-slice.ts` with `createSlice`.
2. Export the reducer and add it to `src/store/store.ts`.
3. Export typed selectors from the slice file.
4. Never access another slice's state inside a reducer — use `createSelector` for cross-slice reads.

---

## API Calls (Client → Server)

### Standard fetch pattern with error handling
```typescript
const res = await fetch('/api/trips', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
if (!res.ok) {
  const err = await res.json();
  throw new Error(err.message ?? 'Request failed');
}
const data = await res.json();
```

### Server Actions are NOT used — all mutations go through API routes.

---

## API Route Handlers

### Standard route shape
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = MySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await doWork(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/my-route]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

### Auth check order
1. `getServerSession` — fail fast with 401.
2. Zod parse body — fail fast with 400.
3. Authorization check (does user own the resource?) — fail with 403.
4. Business logic.

---

## Trip Persistence

### Writing a trip plan
Always go through `src/lib/trips/persistence.ts`:
```typescript
import { saveTripPlan } from '@/lib/trips/persistence';

await saveTripPlan({
  tripId,
  userId,
  destinations,
  expectedVersion, // from current trip in DB — enables optimistic locking
});
```

Never write `ItineraryDay` or `ItineraryItem` rows directly outside of `persistence.ts`.

### Reading a trip for globe hydration
```typescript
import { convertTripToGlobeDestinations } from '@/lib/api/trip-converter';
const destinations = convertTripToGlobeDestinations(trip);
```

---

## AI Tool Calls

### Adding a new orchestrator tool
1. Create `src/lib/ai/tools/my-tool.ts` — export a pure function + Zod input schema.
2. Register in `src/lib/ai/orchestrator.ts` tool registry.
3. Return a structured result; **never throw** — return `{ error: string }` instead.
4. Log input/output at the tool boundary.

### Validating AI output before DB write
```typescript
import { DraftItinerarySchema } from '@/lib/ai/types';

const parsed = DraftItinerarySchema.safeParse(rawLLMOutput);
if (!parsed.success) {
  return { error: 'LLM output failed validation', issues: parsed.error.issues };
}
```

---

## Error Handling

### Client-side async errors
```typescript
try {
  await someAction();
} catch (err) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  dispatch(setNotification({ type: 'error', message }));
}
```

### Server-side — never expose internals
```typescript
// BAD
return NextResponse.json({ error: err.message }); // may leak DB details

// GOOD
console.error('[context]', err);
return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
```

---

## Authentication

### Checking auth in API routes
```typescript
const session = await getServerSession(authOptions);
if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const userId = session.user.id; // string, guaranteed
```

### Checking resource ownership
```typescript
const trip = await prisma.trip.findUnique({ where: { id: tripId } });
if (!trip || trip.userId !== userId) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

---

## Semantic Search

### Finding experiences by intent
```typescript
import { semanticSearch } from '@/lib/semantic-search';

const results = await semanticSearch({
  query: 'outdoor cooking with a local',
  cityId,
  limit: 10,
});
```

Category synonyms are defined in `src/lib/semantic-search.ts` — add new categories there, not inline.

---

## Image Selection

### Getting images for a place
```typescript
import { selectImagesForPlace } from '@/lib/images/image-selection-service';

const images = await selectImagesForPlace({
  placeId,
  placeName,
  count: 3,
});
```

Do not call Google Places, Unsplash, or Pexels APIs directly from components or orchestrator tools.

---

## Cesium Globe

### Adding a new marker type
1. Define the marker data shape in `src/types/globe.ts`.
2. Add it to the appropriate Redux slice.
3. Render in `cesium-globe.tsx` using the existing SVG→data-URL cache pattern — never create `new Cesium.BillboardCollection()` outside of the existing entity management.

### Syncing map selection with sidebar
Map selection updates `globe.selectedDestination`; the sidebar reads the same value. Don't maintain separate selection state in components.

---

## Stripe

### Creating a booking payment
```typescript
import { createBookingPaymentIntent } from '@/lib/stripe/payments';

const { clientSecret } = await createBookingPaymentIntent({
  bookingId,
  amountCents,
  hostStripeAccountId,
});
```

Never call `stripe.paymentIntents.create` directly in an API route — use the helpers in `src/lib/stripe/`.

---

## Drag & Drop (Itinerary reordering)

Use `@dnd-kit/core` with the existing setup in `itinerary-day.tsx`:
- `DndContext` wraps the day list.
- `SortableContext` wraps items within a day.
- `useSortable` hook on individual items.
- On `onDragEnd`: dispatch a Redux action to reorder, then persist.
