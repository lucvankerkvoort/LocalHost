# Availability + Stripe Connect Architecture Spec (Host Experiences)

## Problem Statement
Host-side availability and Stripe Connect onboarding are returning “Forbidden” and are not usable. Availability must support date ranges + selected weekdays (no time slots). Trip dates are not implemented and must not block availability.

---

## Likely Root Causes (Architecture-Level)
1) Ownership mismatch
   - /api/host/availability enforces experience.hostId === session.user.id.
   - If the experience list includes experiences not owned by the logged-in user, every request returns 403.

2) Route role ambiguity
   - Host-only pages are reachable by non-hosts (or by hosts on non-owned experiences) without a clear gate.

3) Availability model mismatch
   - UI allows time slots; backend stores time slots; product wants date-only.
   - This creates confusion and inconsistent usage.

4) Stripe Connect prerequisites
   - Connect flow assumes an existing User in DB and correct Stripe keys + return URLs.
   - If the user record is missing or return URL is mis-configured, onboarding fails.

---

## Canonical Decisions
- Availability is date-only. No time slots.
- Availability is experience-scoped and host-owned.
- Trip dates are optional and do not block availability setup.
- Host routes require ownership and must show a clear UX when forbidden.

---

## Availability Model (Date-Only)
ExperienceAvailability
- experienceId
- date (UTC midnight)
- spotsLeft (optional)
- timezone (optional, display only)

Invariants
- startTime and endTime are always null.
- One row per (experienceId, date).

---

## API Contract (Host Availability)

### Host-Write
GET /api/host/availability?experienceId=...
- Requires auth.
- Requires experience.hostId === session.user.id.

POST /api/host/availability
- Input: experienceId, dates[], spotsLeft?, timezone?.
- Creates date-only entries (no times).
- Idempotent by (experienceId, date).

DELETE /api/host/availability
- Input: ids[].

### Guest-Read
GET /api/availability?experienceId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
- Public read only (no auth required).

---

## UI Requirements

### Host Availability Page: /experiences/[experienceId]/availability
- Must remove time slot controls and any timeslot copy.
- UI should accept:
  - Date range
  - Weekdays selection
  - Optional spotsLeft
- On submit, UI generates date list and posts to /api/host/availability.

### Ownership Gate
- If user does not own the experience:
  - Show “You don’t own this experience” instead of generic “Forbidden”.
  - Offer link back to host dashboard.

---

## Stripe Connect (Host Onboarding) Boundaries
- Host must have a DB User record (otherwise connect fails).
- Connect onboarding must use correct origin for return/refresh URLs.
- Add a UX state for:
  - “Not a host” vs “Host but not onboarded”.

---

## Required Host Experience List Rule
- The host experience list must only list experiences owned by the logged-in user.
- Availability links must originate from this list.

---

## Acceptance Criteria
1) Host can set date ranges + selected weekdays and save availability.
2) Non-owner sees a clear “Not your experience” message, not generic forbidden.
3) No time slots appear anywhere in availability flows.
4) Stripe Connect onboarding works for a valid host user with correct Stripe keys.
5) Guest availability reads continue to work without auth.

---

## Diagnostics (What to Verify)
- Does the logged-in user own the experience ID used in /availability?
- Is the host experience list filtered to hostId === session.user.id?
- Are Stripe STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and domain return URLs valid?
- Is the user row present in DB (connect flow assumes it exists)?
