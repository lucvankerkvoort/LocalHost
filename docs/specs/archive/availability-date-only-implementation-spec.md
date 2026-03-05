# Implementation Spec — Stabilize Host Availability (Date‑Only)

Date: 2026-02-01
Scope: Host availability UI + APIs (date‑only), ownership gate UX

## Objective
Convert availability to date‑only (no time slots), enforce date‑only reads/writes, and show a friendly ownership gate when a user attempts to manage an experience they do not own.

---

## Functional Requirements

1) **Remove time‑slot UI and storage assumptions**
- Availability UI must not expose start/end time inputs.
- All availability entries created by the UI must have `startTime = null` and `endTime = null`.
- Copy in the UI must not reference time slots.

2) **Enforce date‑only availability writes and reads**
- `POST /api/host/availability` accepts a list of dates (YYYY‑MM‑DD) and creates date‑only records.
- `GET /api/host/availability` returns date‑only records (startTime/endTime always null).
- `GET /api/availability` returns date‑only records.
- Use a single canonical rule for date parsing: `YYYY‑MM‑DD` is interpreted as UTC midnight (`T00:00:00.000Z`).

3) **Ownership gate (friendly “not your experience” state)**
- If a user visits `/experiences/[experienceId]/availability` for an experience they do not own, the UI should render a friendly state rather than failing silently or showing generic errors.
- The API should still return 403 for unauthorized access; the UI should interpret it and show a friendly message + action (back to “My Experiences”).

---

## Non‑Goals
- No trip‑date integration.
- No booking logic changes.
- No time‑zone logic beyond storing an optional display value.

---

## Data Model & Invariants

**ExperienceAvailability** (existing model)
- `date` is stored at UTC midnight for date‑only availability.
- `startTime` and `endTime` are always null for date‑only entries.
- One row per `(experienceId, date)`.

---

## API Changes

### 1) `POST /api/host/availability`
**Input**
```json
{
  "experienceId": "...",
  "dates": ["2026-02-12", "2026-02-13"],
  "spotsLeft": 4,
  "timezone": "Europe/Rome"
}
```

**Behavior**
- Validate ownership: `experience.hostId === session.user.id`.
- Convert each date string to UTC midnight Date.
- Create date‑only rows with `startTime = null`, `endTime = null`.
- Be idempotent on `(experienceId, date)` (skip duplicates).

**Response**
```json
{ "created": 2, "skipped": 1 }
```

### 2) `GET /api/host/availability?experienceId=...`
- Require auth + ownership.
- Return date‑only records (no time data).

### 3) `GET /api/availability?experienceId=...&from=YYYY-MM-DD&to=YYYY-MM-DD`
- Public read.
- Return date‑only records.

---

## UI Changes

### `/experiences/[experienceId]/availability`
**Remove**
- Time slot add/remove UI.
- Time slot copy.

**Keep / Adjust**
- Date range selection.
- Weekday filter.
- Spots left input (optional).
- Timezone input (optional, label “display only”).

**Submit Logic**
- Generate list of dates in range filtered by weekdays.
- POST payload uses `dates[]` (no time slots).

**Ownership Gate UX**
- If API returns 403, render a card with:
  - Title: “This isn’t your experience”
  - Body: “Only the host can edit availability.”
  - Action: “Back to My Experiences” linking to `/experiences`.

---

## Files to Change (Targeted)

- `src/app/experiences/[experienceId]/availability/page.tsx`
  - Remove time slot inputs and related state.
  - Change POST payload to `dates[]`.
  - Add 403 ownership gate UI state.

- `src/app/api/host/availability/route.ts`
  - Accept `dates[]` in POST.
  - Force `startTime`/`endTime` to null.
  - Idempotency for duplicates.
  - Return `created` + `skipped` counts.

- `src/app/api/availability/route.ts`
  - Ensure response contains date‑only entries (ignore time fields).

---

## Acceptance Criteria
1) Host can save date ranges + weekday filters without time slots.
2) API stores date‑only rows (`startTime/endTime` null).
3) Non‑owner sees a friendly message instead of a silent failure.
4) Guest availability read endpoint returns date‑only entries.

---

## Rollback Plan
- Revert UI to previous time‑slot behavior and restore POST payload format.
- Keep DB unchanged (date‑only rows are compatible with time‑slot model).
