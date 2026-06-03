# Trip Generation Flow — Implementation Spec

**Feature:** Question → Complete Itinerary (end-to-end)
**Status:** Planning
**Priority:** P0 — core product loop
**Design reference:** [System Design §9](../system-design.md#9-core-user-flow-question--complete-itinerary)

---

## 1. What We're Building

A user types a natural-language travel prompt. Within ~4 seconds they see a full itinerary rendered on the globe and in the sidebar, with host experiences woven in. The trip is persisted and the URL updates to `/trip/[id]`.

This is the primary value proposition of the product.

---

## 2. Scope

### In scope (v1 — full-response)
- Server-side prompt parsing (destination, dates, party size)
- Parallel DB queries: host experiences + cached destinations
- Host experience injection into Claude prompt
- Full-response itinerary generation (no mid-stream rendering)
- Zod validation of AI output
- Persistence: Trip → ItineraryDay[] → ItineraryItem[]
- Globe pin render + camera fly-to on completion
- Skeleton loader during generation
- URL update to `/trip/[id]` on persist

### Out of scope (v2 — streaming)
- SSE partial JSON streaming
- Incremental day card rendering
- Globe pin appearance as coordinates arrive

---

## 3. Files That Will Change

| File | Layer | Change |
|------|-------|--------|
| `src/lib/ai/types.ts` | Types | Add/validate `ItineraryGenerationRequest` and `ItineraryGenerationResponse` Zod schemas |
| `src/lib/ai/orchestrator.ts` | AI | Add parallel DB query phase before Claude call; inject host experiences |
| `src/app/api/itinerary/candidates/route.ts` | API | Verify Zod validation on request body; fix any auth gaps |
| `src/lib/trips/persistence.ts` | DB | Ensure Trip → Day → Item upsert is atomic; verify version increment |
| `src/lib/ai/plan-converter.ts` | Converter | Verify deterministic ID generation survives re-apply |
| `src/components/features/itinerary-day.tsx` | UI | Add skeleton loader state |
| `src/components/features/cesium-globe.tsx` | UI | Confirm pins are derived from Redux, not local state |
| `src/store/slices/orchestratorSlice.ts` | State | Add `generating` status flag to drive skeleton UI |

### GOTCHAS.md entries that apply
- Trip versioning: every write must go through `persistence.ts` with `expectedVersion` check
- `plan-converter.ts`: ID generation must stay deterministic — never use `Math.random()`
- Cesium globe: globe state is derived from Redux, never the source of truth
- Semantic search: `ST_DWithin` queries require PostGIS extension — verify it's active on DB

---

## 4. Phase 1 — Types & Schemas First

Define before writing any implementation logic.

### 4.1 `ItineraryGenerationRequest`

```typescript
// src/lib/ai/types.ts
export const ItineraryGenerationRequestSchema = z.object({
  userMessage: z.string().min(1).max(2000),
  tripId: z.string().uuid().optional(), // present if updating an existing trip
  parsedContext: z.object({
    destinations: z.array(z.string()).min(1),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    durationDays: z.number().int().positive().optional(),
    partySize: z.number().int().positive().optional(),
    interests: z.array(z.string()).optional(),
  }),
});

export type ItineraryGenerationRequest = z.infer<typeof ItineraryGenerationRequestSchema>;
```

### 4.2 `ItineraryGenerationResponse`

```typescript
export const GeneratedItineraryDaySchema = z.object({
  dayNumber: z.number().int().positive(),
  date: z.string().datetime().optional(),
  destination: z.string(),
  lat: z.number(),
  lng: z.number(),
  items: z.array(z.object({
    time: z.string().optional(),
    title: z.string(),
    description: z.string(),
    type: z.enum(['ACTIVITY', 'MEAL', 'TRANSPORT', 'ACCOMMODATION']),
    experienceId: z.string().uuid().optional(), // linked host experience if matched
    durationMinutes: z.number().int().positive().optional(),
  })),
});

export const ItineraryGenerationResponseSchema = z.object({
  title: z.string(),
  days: z.array(GeneratedItineraryDaySchema).min(1),
  summary: z.string().optional(),
});

export type ItineraryGenerationResponse = z.infer<typeof ItineraryGenerationResponseSchema>;
```

---

## 5. Phase 2 — Server Logic

### 5.1 Input Parsing

Extract structured context from the user message before the Claude call. This runs server-side so Claude gets clean data, not raw text.

```typescript
// src/lib/ai/parse-travel-intent.ts
async function parseTravelIntent(message: string): Promise<ParsedTravelContext> {
  // Use a lightweight Claude call (haiku) with a strict extraction schema
  // Return: destinations[], dates, duration, party size, interests
}
```

### 5.2 Parallel Pre-fetch

```typescript
const [hostExperiences, cachedDestinations] = await Promise.all([
  db.experience.findMany({
    where: {
      status: 'PUBLISHED',
      // PostGIS ST_DWithin for each destination in parsedContext.destinations
    },
  }),
  db.destination.findMany({
    where: { name: { in: parsedContext.destinations } },
  }),
]);
```

### 5.3 Prompt Assembly

```typescript
const systemPrompt = `
You are a travel planning assistant. Return ONLY valid JSON matching this schema — no prose, no markdown.
${JSON.stringify(ItineraryGenerationResponseSchema.shape)}

Available host experiences to weave in where contextually appropriate:
${JSON.stringify(hostExperiences.map(e => ({ id: e.id, title: e.title, description: e.description, lat: e.lat, lng: e.lng })))}
`.trim();
```

### 5.4 Claude Call + Validation

```typescript
const raw = await callClaude({ system: systemPrompt, user: message });
const parsed = ItineraryGenerationResponseSchema.safeParse(JSON.parse(raw));
if (!parsed.success) {
  // Retry once with stricter prompt
  // If still fails, return structured error — never throw raw Zod error to client
}
```

### 5.5 Persistence

```typescript
// Goes through persistence.ts — never direct Prisma writes
const trip = await createOrUpdateTrip({
  userId,
  itinerary: parsed.data,
  expectedVersion: existingTrip?.version,
});
```

---

## 6. Phase 3 — Client State

### 6.1 Redux orchestratorSlice additions

```typescript
// Add to orchestratorSlice
generating: boolean;      // drives skeleton UI
generationError: string | null;
```

### 6.2 Skeleton loader

While `generating === true`:
- Itinerary sidebar shows 3–5 placeholder day cards (shimmer animation)
- Globe shows a pulsing indicator at the destination
- Submit button disabled

### 6.3 On success

1. Dispatch itinerary to Redux state
2. Dispatch globe pins
3. Push URL to `/trip/[id]`
4. Set `generating = false`

---

## 7. Phase 4 — Tests (write before implementation)

### Unit tests

| Test | File | What to test |
|------|------|-------------|
| Schema validation | `__tests__/ai/types.test.ts` | Valid + malformed AI responses against `ItineraryGenerationResponseSchema` |
| Input parser | `__tests__/ai/parse-travel-intent.test.ts` | Destination extraction, date parsing, party size inference |
| Plan converter | `__tests__/ai/plan-converter.test.ts` | Deterministic IDs, no duplicates on re-apply |
| Persistence | `__tests__/trips/persistence.test.ts` | Atomic write, version increment, rollback on failure |

### Integration tests

| Test | What to test |
|------|-------------|
| `/api/itinerary/candidates` POST | Returns 400 on missing destination, 401 on unauthed, 200 with valid input |
| Prompt assembly | Given mock experiences, system prompt contains serialized experience data |

---

## 8. Definition of Done

- [ ] `ItineraryGenerationRequestSchema` and `ItineraryGenerationResponseSchema` defined and exported from `src/lib/ai/types.ts`
- [ ] Types derived from schemas via `z.infer<>` — no duplicated type definitions
- [ ] Parallel pre-fetch (host experiences + cached destinations) runs before Claude call
- [ ] Host experiences injected into system prompt
- [ ] Claude response validated by Zod before touching DB or Redux
- [ ] Persistence goes through `persistence.ts` with version check
- [ ] Skeleton loader shown during generation (`generating` flag in Redux)
- [ ] URL updates to `/trip/[id]` on persist
- [ ] No `console.log` in production paths — use `logger()` from `src/lib/logger.ts`
- [ ] No `any` types — strict TypeScript throughout
- [ ] Unit tests passing for schema validation, parser, converter, persistence
- [ ] GOTCHAS.md updated if any new fragile behaviour discovered
- [ ] PROMPTS.md updated with the final system prompt template

---

## 9. v2 Upgrade Path (Streaming)

When ready to add streaming:

1. Change `/api/itinerary/generate` to return a `ReadableStream` (Vercel AI SDK `streamText`)
2. Server pushes completed day objects as SSE events as they parse from the stream
3. Client subscribes and dispatches each day to Redux as it arrives
4. Globe pins appear incrementally
5. Persistence triggers on `stream.done` event

The Redux shape and persistence layer do not change — only the transport layer changes from request/response to streaming.

---

## 10. Open Questions

| Question | Owner | Status |
|----------|-------|--------|
| Do we parse intent with a separate haiku call or regex? | Luc | Open |
| What radius (km) for `ST_DWithin` experience matching? | Luc | Open — suggest 50km default |
| v1 or v2 (streaming) for initial ship? | Luc | Open — suggestion: v1 first, v2 next sprint |
| Should `/trip/[id]` be a distinct route or same page with URL update? | Luc | Open |
