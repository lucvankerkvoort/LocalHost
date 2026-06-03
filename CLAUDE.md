# CLAUDE.md — AI Behavioral Contract

## What You Must Never Do

- **Never drop or overwrite trip version numbers** without an `expectedVersion` conflict check (`src/lib/trips/versioning.ts`).
- **Never write directly to `Trip` without going through the persistence layer** (`src/lib/trips/persistence.ts`). Bypass creates orphaned `ItineraryItem` records.
- **Never hardcode coordinates** — always go through `resolve_place` / Google Places API + `PlaceCache`.
- **Never call the OpenAI/Anthropic SDK directly from a component or API route** — all LLM calls go through `src/lib/ai/orchestrator.ts` or designated tool files.
- **Never mutate Redux state outside of slice reducers.** Dispatch actions; don't call `store.getState()` and write back.
- **Never skip Zod validation** on AI output before it touches the DB or Redux state.
- **Never expose raw Prisma errors to the client** — map them to typed API errors.
- **Never commit `.env` values** or Stripe keys.
- **Never call `/api/orchestrator` from server components** — it has rate-limiting state that only makes sense client-side.

## Patterns to Follow

- **Check `PATTERNS.md`** before solving state management, API calls, error handling, or auth.
- **Check `GOTCHAS.md`** before touching: trip versioning, Cesium globe, synthetic bots, semantic search, Stripe payouts.
- Use Zod schemas defined in `src/lib/ai/types.ts` and `src/types/` — don't invent new ones inline.
- Keep AI tool functions (`src/lib/ai/tools/`) pure and side-effect-free where possible. DB writes belong in API routes.
- Itinerary item IDs must be deterministic: `day-${dayNumber}` for destinations, consistent hashes for items. Never use `Math.random()` for persistent IDs.
- Redux slices: one slice per domain (`globe`, `orchestrator`, `toolCalls`, `hosts`, `hostCreation`, `p2pChat`, `profile`, `ui`).

## Development Workflow — Required Phases

Every non-trivial piece of work must go through these phases in order. Do not skip ahead.

### Phase 1 — Plan
Before writing any code:
1. State what the feature/fix is in one sentence.
2. Identify which files will change and which layers they touch.
3. Identify any GOTCHAS.md entries that apply.
4. Confirm the approach with the user if any of the following apply:
   - Touches Prisma schema or trip versioning.
   - Changes a Zod schema that is used as an AI output contract.
   - Adds or removes a Redux slice.
   - Involves a new external API or service.

### Phase 2 — Define the Types & Schema First
Before writing implementation logic:
1. Define or update the TypeScript types in `src/types/`.
2. Define or update the Zod schema in `src/lib/ai/types.ts` or co-located with the route.
3. Every API request body, API response, and AI output **must have a Zod schema**. No exceptions.
4. Types must be derived from schemas where possible: `type MyType = z.infer<typeof MySchema>`.

### Phase 3 — Write Tests First (TDD)
Before writing the implementation:
1. Write the unit tests for the logic being built (reducers, converters, validators, pure functions).
2. Tests should fail at this point — that is expected and correct.
3. See `PATTERNS.md` → Testing for the exact test file locations and patterns.

### Phase 4 — Implement
Write the implementation to make the unit tests pass. Follow PATTERNS.md for all code decisions.

### Phase 5 — Definition of Done Checklist
A task is not done until every item below is checked:

- [ ] All TypeScript types defined — no `any`, no implicit `unknown`.
- [ ] Zod schema written for every API boundary and AI output involved.
- [ ] Types derived from schemas (`z.infer<typeof Schema>`), not duplicated.
- [ ] Unit tests written and passing for all decision logic (reducers, converters, validators).
- [ ] API route follows the standard shape in PATTERNS.md (auth → validate → authorize → logic).
- [ ] No raw Prisma errors exposed to the client.
- [ ] No `console.log` left in production paths.
- [ ] PROMPTS.md updated if any AI prompt changed.
- [ ] GOTCHAS.md updated if a new fragile area was discovered.

### Phase 6 — Playwright E2E Tests
After the feature is working, write the Playwright test for every affected user flow:
1. Add or update the relevant spec file in `e2e/`.
2. Add `data-testid` attributes to any new elements the test needs to interact with.
3. Mock `/api/orchestrator` to avoid LLM cost and flakiness in CI.
4. Test must pass before the task is considered fully closed.
5. See `PATTERNS.md` → Playwright for structure, file naming, and selector rules.

## What to Ask Before Acting

- Before touching the Prisma schema, confirm the migration won't break existing `TripRevision` payloads.
- Before changing `plan-converter.ts`, confirm the ID generation strategy stays stable across re-applies.
- Before modifying `cesium-globe.tsx`, confirm the SVG→data-URL cache strategy is preserved.
- Before adding a new API route, confirm it belongs server-side (not achievable by a tool or existing route).
- Before adding a new Redux slice, confirm existing slices don't already own the domain.
- Before changing `orchestrator.ts` prompt schemas, update `PROMPTS.md`.

## Code Style

- TypeScript strict mode — no `any`, no non-null assertions without a comment.
- Readonly types for data flowing out of the DB.
- Discriminated unions over boolean flags (e.g., `status: 'DRAFT' | 'PENDING' | 'BOOKED' | 'FAILED'`).
- No magic strings — use the enums/constants in `src/types/`.
- No console.log in production paths — use structured logging at API boundaries.
