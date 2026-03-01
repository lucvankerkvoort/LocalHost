# Implementation Spec — Fix Availability Ownership (Experience Table Mismatch)

Date: 2026-02-01
Scope: Availability ownership + publish pipeline alignment

## Objective
Fix the “This isn’t your experience” error for legitimate owners by aligning availability lookups with the correct experience table. Ensure published host experiences have a corresponding `Experience` row so `/api/host/availability` can authorize properly.

---

## Root Cause (Confirmed)
- `getUserExperiences()` returns IDs from **ExperienceDraft** and **HostExperience**.
- `/api/host/availability` queries **Experience** by `id`.
- Result: Experience not found → 403 Forbidden even for the owner.

---

## Canonical Decision
**Availability is only for published experiences**, and the availability API will continue to use the **Experience** table.

Therefore, **publishing must create a matching Experience row** (marketplace record) for each HostExperience.

---

## Requirements

### 1) Publish creates a marketplace `Experience`
- When a draft is published, create an `Experience` row.
- Use **the same ID** for both `HostExperience.id` and `Experience.id` to avoid mapping tables.
- Set required `Experience` fields using draft data + safe defaults.

**Required defaults (MVP):**
- `category`: default to `ARTS_CULTURE` (or a configurable default).
- `neighborhood`: use `city` if unknown.
- `minGroupSize`/`maxGroupSize`: use defaults (1/6) or draft values if present.
- `price`: use draft price if set, otherwise default (e.g., 5000).

### 2) Availability only for published experiences
- Availability UI **must not** allow availability for drafts.
- Draft cards should hide or disable the “Availability” action.
- If availability is requested for a draft ID, show a friendly “Publish first” state.

### 3) Ownership errors become explicit
- `/api/host/availability`:
  - If `Experience` not found but `HostExperience` exists for that ID → return 409 with “Publish required”.
  - If neither exists → 404.
  - If exists but hostId mismatch → 403.

### 4) Backfill for existing HostExperience records
- Add a **one‑time backfill** script:
  - For each HostExperience with no matching Experience (same ID), create an Experience row using the same defaults.
- This can be a dev script (e.g. `scripts/backfill-marketplace-experiences.ts`).

---

## Files to Change (Targeted)

1) `src/app/api/host/publish/route.ts`
- Create Experience row alongside HostExperience.
- Explicitly set `id` for both to the same value.

2) `src/actions/experiences.ts`
- Ensure published experience entries use the **published Experience/HostExperience ID** (unchanged if IDs are aligned).

3) `src/components/experiences/experience-card.tsx`
4) `src/components/experiences/experience-list.tsx`
- Hide “Availability” for drafts (or show “Publish to enable availability”).

5) `src/app/experiences/[experienceId]/availability/page.tsx`
- Handle 409 or 404 with friendly “Publish first” UI.

6) `src/app/api/host/availability/route.ts`
- Improve error semantics (409 when published Experience missing).

7) `scripts/backfill-marketplace-experiences.ts` (new)
- Backfill Experience rows for existing HostExperience data.

---

## Acceptance Criteria
1) A published experience owner can open availability without 403.
2) Drafts do not route to availability (or show a “Publish first” gate).
3) `/api/host/availability` returns:
   - 409 when HostExperience exists but Experience missing
   - 404 when neither exists
   - 403 only for true ownership mismatch
4) Backfill script creates missing Experience rows successfully.

---

## Notes / Edge Cases
- If you decide later to merge HostExperience and Experience, this spec can be deprecated.
- This spec assumes `Experience` remains the canonical table for availability + bookings.
