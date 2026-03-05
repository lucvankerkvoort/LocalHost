# Implementation Spec — Fix Stripe Connect Onboarding

Date: 2026-02-01
Scope: Stripe Connect onboarding stability and ownership/host gating

## Objective
Make Stripe Connect onboarding reliable for valid hosts, prevent misleading “Forbidden” states by ensuring host experience lists are owned by the current user, and provide clear UX for non‑hosts.

---

## Functional Requirements

1) **Host gating and ownership correctness**
- The “My Experiences” list must include only experiences owned by the current user.
- Availability links must only be rendered for owned experiences.
- Non‑host users should see a clear CTA to become a host (not a broken onboarding flow).

2) **Connect onboarding must work for valid hosts**
- `/api/hosts/stripe/connect` must only be callable by an authenticated user.
- If the user does not have a DB record, return a clear error.
- Onboarding link must use the correct origin (supports local + prod).

3) **Onboarding status must be visible and accurate**
- The host dashboard card must reflect actual Stripe status.
- If Stripe account exists, fetch current status and update the DB.

---

## Non‑Goals
- No payments/booking changes.
- No new payout logic.
- No changes to Stripe fees.

---

## Current Issues (Suspected)
- Experience list may include drafts/published experiences that do not match ownership.
- Host pages are accessible by non‑host users, causing confusing errors.
- Stripe account creation fails if user is missing or has no email.

---

## API Changes

### 1) `POST /api/hosts/stripe/connect`
- Validate session.
- Fetch user by `session.user.id`.
- If user not found: return `404 User not found`.
- If user email missing: return `400 Email required for Stripe Connect`.
- Create or reuse Connect account and return account link.

### 2) `GET /api/hosts/stripe/status`
- When a connected account exists, call Stripe to refresh status.
- Return `status`, `payoutsEnabled`, and `chargesEnabled` consistently.
- If no account exists, return `NOT_STARTED`.

---

## UI Changes

### My Experiences Page (`/experiences`)
- If user is not authenticated, redirect to sign‑in (already in middleware).
- If user is authenticated but not a host (no published experience + no draft), show CTA to create a host profile.

### Payout Setup Card
- Show “Connect Stripe” if status is NOT_STARTED.
- If status is RESTRICTED, show guidance to continue setup.
- If status COMPLETE + payoutsEnabled, show “Manage Settings”.

---

## Ownership Guardrails

- `getUserExperiences()` must return only experiences where `hostId === session.user.id`.
- Availability links (`/experiences/[experienceId]/availability`) should only be shown for owned experiences.

---

## Files to Change (Targeted)

- `src/actions/experiences.ts`
  - Ensure published experience query filters by `hostId === session.user.id`.

- `src/app/experiences/page.tsx`
  - Improve empty state for non‑host users (clear CTA).

- `src/components/experiences/payout-setup-card.tsx`
  - Ensure card copy reflects Stripe status correctly.

- `src/app/api/hosts/stripe/connect/route.ts`
  - Add user existence + email checks.

- `src/app/api/hosts/stripe/status/route.ts`
  - Ensure a consistent response shape with `chargesEnabled`.

---

## Acceptance Criteria
1) A valid host can click “Connect Stripe” and is redirected to Stripe onboarding.
2) Non‑host users do not see a broken onboarding flow.
3) Owned experience list is correct (no foreign experiences).
4) Stripe status updates correctly on refresh.

---

## Rollback Plan
- Revert endpoint checks and UI messaging to prior behavior.
- No DB migrations required.
