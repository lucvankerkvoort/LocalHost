# Approach: Diff-Based Trip Modification

## The Problem

When a user asks to modify their trip (e.g. "swap day 2 to focus on food"), `handleModifyPlan` currently calls `planTrip(...)` — the full creation pipeline. For a 7-day trip with 5 stops per day that's roughly:

- 1 inventory search
- 1 draft AI call
- 1 trip anchor `resolve_place`
- 7 day anchor `resolve_place` calls
- 35 activity `resolve_place` calls (5/day × 7 days)
- 7 route generations

= **~52 tool calls** for a change that might only affect 1 day.

The `TODO` comment at line 601 already acknowledges this: `// TODO: Implement smarter diff-based modification`.

---

## Proposed Approach

### Core idea

Instead of regenerating everything, ask the AI to produce a **diff** — a minimal description of what changed — and then only re-geocode the affected days.

### Step 1: Generate the diff (1 AI call)

A new `generateModificationDiff` method takes:
- The user's modification request
- The existing plan serialized as a compact summary (day titles + activity names, no coordinates)

The AI output is a structured diff schema:

```typescript
type ModificationDiff = {
  summary: string; // what changed, for the response message
  affectedDays: Array<{
    dayNumber: number;
    action: 'keep' | 'modify' | 'remove';
    // Only present when action === 'modify':
    updatedTitle?: string;
    updatedActivities?: Array<{
      name: string;
      description: string;
      notes: string | null;
      placeId: string | null;
      timeSlot: 'morning' | 'afternoon' | 'evening';
    }>;
  }>;
  newDays?: Array<DraftDay>; // only if days are being added
};
```

The key constraint: the AI is only allowed to output `modify` for the days actually affected by the request. Days not mentioned default to `keep`.

### Step 2: Process only modified days

For each day with `action: 'modify'`:
- Build a minimal `DraftDay` from the diff output
- Run it through the existing `processDay` pipeline (which handles `resolve_place` + routing)
- This reuses all the existing geocoding, route generation, and host logic — no new code needed there

For `action: 'keep'`:
- Copy the existing `DayPlan` from `session.plan.days` unchanged — zero tool calls

For `action: 'remove'`:
- Drop the day from the result

For `newDays` (added days):
- Run through `processDay` as normal

### Step 3: Merge and return

Reconstruct the full `ItineraryPlan` from kept + modified + new days, sorted by day number. Update `session.plan` and return.

---

## Tool call count comparison

| Scenario | Current | Proposed |
|---|---|---|
| Change 1 activity on day 2 of a 7-day trip | ~52 calls | ~7 calls (1 diff + 5 resolve_place + 1 route) |
| Swap day 3 entirely | ~52 calls | ~8 calls |
| Add a new day | ~52 calls | ~7 calls (just the new day) |
| Full regeneration (destination change) | ~52 calls | ~52 calls (all days marked `modify`) |

---

## What changes in the codebase

### 1. `orchestrator.ts` — `handleModifyPlan`

Replace the current 3-line stub with:

```typescript
private async handleModifyPlan(message, session) {
  const diff = await this.generateModificationDiff(message, session.plan);
  const updatedPlan = await this.applyDiff(diff, session.plan, message);
  return {
    session: updateSessionPlan(session, updatedPlan),
    response: `✅ Updated: ${diff.summary}`,
  };
}
```

### 2. `orchestrator.ts` — new `generateModificationDiff` method

One `generateObject` call with the diff schema above. The prompt includes a compact serialization of the existing plan so the AI knows what exists.

### 3. `orchestrator.ts` — new `applyDiff` method

Iterates the diff, calls `processDay` for modified/new days, passes through unchanged days. Returns a merged `ItineraryPlan`.

No changes needed to: `processDay`, `resolve_place`, `planTripFromDraft`, `DraftItinerarySchema`, the converter, the store, or the UI.

---

## Edge cases to handle

**Destination changes** ("change the whole trip to Rome instead of Paris")
- The AI will mark all days as `modify` — this correctly falls back to near-full regeneration, which is appropriate since coordinates, routes, and hosts all change.

**Day number renumbering** (removing day 3 from a 5-day trip)
- After merging, renumber days sequentially and regenerate inter-city routes between affected adjacent days only.

**The session plan is null**
- This already has a guard — return "no trip to modify". No change needed.

**The AI hallucinates `keep` for a day that was asked to change**
- The result would just be incomplete. Acceptable for v1; could add a validation pass later.

---

## What this does NOT fix

- The first `CREATE_PLAN` is still a full pipeline — that's correct behavior
- The `MODIFY_PLAN` diff call itself adds 1 AI call, which is fast (structured output, small schema)
- Existing trips in the DB don't store the `ItineraryPlan` in session — `session.plan` is in-memory per conversation. If the user starts a new conversation, we'd need to reconstruct the plan from the DB before diffing. This is a separate concern from the perf fix.

---

## Suggested implementation order

1. Write `generateModificationDiff` + the diff schema (isolated, testable)
2. Write `applyDiff` using existing `processDay`
3. Swap `handleModifyPlan` to use them
4. Add a test case: 7-day plan, modify 1 day, assert that only 1 day's activities have new IDs
