# Travel Intent Parsing — Implementation Spec

**Feature:** Pre-generation intent extraction using a fast/cheap model
**Status:** Planning
**Priority:** P1 — improves generation quality and reduces main model load
**Parent spec:** [Trip Generation Flow](./trip-generation-flow-spec.md)

---

## 1. What We're Building

Before the main itinerary generation call, run a lightweight extraction pass over the user's raw message to pull out structured travel context: destinations, dates, duration, party size, and interests. This structured context is then injected into the main generation prompt so the expensive model receives clean data rather than needing to parse freeform text itself.

**OpenAI model choice:** `gpt-4o-mini` — the fast/cheap model equivalent to Anthropic's Haiku. Already used in this codebase for image reranking (`OPENAI_IMAGE_RERANK_MODEL`).

---

## 2. Why a Separate Parse Step

Without this step, the orchestrator sends the raw user message directly to `gpt-5.2` and expects it to simultaneously parse intent, extract destinations, resolve dates, and generate a multi-day itinerary. This has two costs:

1. **Quality degradation** — the model spends attention on extraction that should go toward creative planning.
2. **Unnecessary cost** — parsing "I want 5 days in Tokyo in April for 2 people" into structured data is a `gpt-4o-mini` job, not a `gpt-5.2` job.

The parse step is cheap (< 200 tokens in/out), fast (< 500ms typically), and deterministic enough to be reliable.

---

## 3. Scope

### In scope
- Extract: `destinations[]`, `startDate`, `endDate`, `durationDays`, `partySize`, `interests[]`, `tripType`
- Structured output via `generateObject` with a Zod schema
- Result injected into the main orchestrator generation prompt
- New model constant `OPENAI_INTENT_PARSE_MODEL` defaulting to `gpt-4o-mini`

### Out of scope
- Replacing intent classification (the `IntentSchema` / `CREATE_PLAN` / `MODIFY_PLAN` routing already in `orchestrator.ts`)
- Geocoding — that stays in `resolve_place` / Google Places
- Handling multi-turn context — this parses the current user message only

---

## 4. Files That Will Change

| File | Change |
|------|--------|
| `src/lib/ai/model-config.ts` | Add `OPENAI_INTENT_PARSE_MODEL` constant |
| `src/lib/ai/parse-travel-intent.ts` | New file — the extraction function |
| `src/lib/ai/types.ts` | Add `ParsedTravelContextSchema` and `ParsedTravelContext` type |
| `src/lib/ai/orchestrator.ts` | Call `parseTravelIntent` before the `generateObject` draft call; pass result into prompt |

---

## 5. Types & Schema

```typescript
// src/lib/ai/types.ts

export const ParsedTravelContextSchema = z.object({
  destinations: z.array(z.string()).min(1).describe(
    'City or region names extracted from the message, e.g. ["Tokyo", "Kyoto"]'
  ),
  startDate: z.string().nullable().describe('ISO date string if a start date was mentioned, else null'),
  endDate: z.string().nullable().describe('ISO date string if an end date was mentioned, else null'),
  durationDays: z.number().int().positive().nullable().describe(
    'Number of days if explicitly stated or inferable from dates, else null'
  ),
  partySize: z.number().int().positive().nullable().describe(
    'Number of travellers if mentioned, else null'
  ),
  interests: z.array(z.string()).describe(
    'Travel interests or activity preferences mentioned, e.g. ["food", "hiking", "museums"]'
  ),
  tripType: z.enum(['ONE_WAY', 'ROUND_TRIP', 'CITY', 'UNKNOWN']).describe(
    'CITY = single destination; ONE_WAY = A→B; ROUND_TRIP = A→B→A; UNKNOWN if unclear'
  ),
});

export type ParsedTravelContext = z.infer<typeof ParsedTravelContextSchema>;
```

---

## 6. Implementation

### 6.1 Model constant

```typescript
// src/lib/ai/model-config.ts
export const OPENAI_INTENT_PARSE_MODEL = resolveModel(
  'OPENAI_INTENT_PARSE_MODEL',
  'gpt-4o-mini'
);
```

### 6.2 Parse function

```typescript
// src/lib/ai/parse-travel-intent.ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { ParsedTravelContextSchema, type ParsedTravelContext } from './types';
import { OPENAI_INTENT_PARSE_MODEL } from './model-config';

const SYSTEM_PROMPT = `
You are a travel intent parser. Extract structured travel context from the user message.
- If information is not present or cannot be inferred, use null (for scalars) or [] (for arrays).
- Do not infer destinations that were not mentioned.
- Dates should be ISO format (YYYY-MM-DD). If only a month is given (e.g. "April"),
  use the next occurrence of that month relative to today.
- durationDays: derive from date range if both dates present; use stated value if given;
  otherwise null.
`.trim();

export async function parseTravelIntent(
  userMessage: string
): Promise<ParsedTravelContext> {
  const { object } = await generateObject({
    model: openai(OPENAI_INTENT_PARSE_MODEL),
    system: SYSTEM_PROMPT,
    prompt: userMessage,
    schema: ParsedTravelContextSchema,
  });
  return object;
}
```

### 6.3 Orchestrator integration

In `orchestrator.ts`, before the `generateObject` draft call:

```typescript
const parsedContext = await parseTravelIntent(userMessage);

// Inject into the system prompt for the main generation call:
// "User is planning: ${parsedContext.durationDays} days in ${parsedContext.destinations.join(', ')}
//  for ${parsedContext.partySize ?? 1} travellers. Interests: ${parsedContext.interests.join(', ')}"
```

The parsed context also feeds the inventory pre-fetch (`searchActivitiesSemantic`) so destination names are reliable rather than parsed inline from freeform text.

---

## 7. Tests (write before implementation)

| Test | File | What to test |
|------|------|-------------|
| Schema validation | `__tests__/ai/types.test.ts` | Valid extraction, all-null case, partial data |
| Parser happy path | `__tests__/ai/parse-travel-intent.test.ts` | Mock `generateObject`; verify output shape |
| Destination extraction | `__tests__/ai/parse-travel-intent.test.ts` | "5 days in Tokyo" → `destinations: ["Tokyo"]`, `durationDays: 5` |
| Null handling | `__tests__/ai/parse-travel-intent.test.ts` | "I want to travel somewhere warm" → `destinations: []` or single vague term, all dates null |
| Date inference | `__tests__/ai/parse-travel-intent.test.ts` | "April 10–17" → correct ISO dates |

---

## 8. Definition of Done

- [ ] `ParsedTravelContextSchema` exported from `src/lib/ai/types.ts`
- [ ] `ParsedTravelContext` type derived via `z.infer<>`
- [ ] `OPENAI_INTENT_PARSE_MODEL` added to `model-config.ts`
- [ ] `parseTravelIntent` implemented in `src/lib/ai/parse-travel-intent.ts`
- [ ] Orchestrator calls `parseTravelIntent` before the draft generation step
- [ ] Parsed context injected into the generation system prompt
- [ ] Unit tests written and passing
- [ ] No `console.log` — use `logger` from `src/lib/logger.ts`
- [ ] `PROMPTS.md` updated with the parse system prompt

---

## 9. Open Questions

| Question | Status |
|----------|--------|
| Should parse failure (network error, model refusal) be a hard stop or fall back to raw message? | Open — suggest soft fallback: log warning, pass raw message to main model |
| Should `parsedContext` be cached per session so follow-up messages reuse it? | Open — out of scope for v1 |
