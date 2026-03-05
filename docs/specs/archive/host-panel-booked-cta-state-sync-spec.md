# Implementation Spec — Host Panel Booked CTA State Sync

Date: 2026-02-03  
Owner: Architect  
Status: Ready for Implementer

## 1) Problem Statement

After successful payment in the trip flow, the Host Panel still shows **"Remove from Day"** for booked experiences instead of **"Booked"** (disabled).

This creates a false affordance: users can remove paid experiences from the day view even though a confirmed booking exists.

## 2) Scope

In scope:
- Trip booking status propagation from Booking records to itinerary item UI state.
- Host Panel CTA derivation (`ADD` / `REMOVE` / `BOOKED`).
- Candidate creation/linking for trip itinerary items.
- Payment success handling so UI success state aligns with persisted booking state.
- Unit and E2E coverage for the full flow.

Out of scope:
- Refund/cancellation policies.
- New payment methods.
- Redesign of Host Panel visuals.

## 3) Current Root Cause

1. Host Panel `BOOKED` state depends on itinerary item status being `BOOKED`.
2. Trip fetch does not derive itinerary item status from related `Booking` records.
3. Stripe webhook updates `Booking.status` to `CONFIRMED`, but that state is not mapped back into itinerary items.
4. Booking candidate creation in trip flow is not reliably linked to the itinerary item (`itemId`), making status projection ambiguous.
5. Client currently shows "Payment Successful" before confirming persisted booking state.

## 4) Required Behavioral Invariants (Must Not Change Unless Explicitly Listed)

1. **DRAFT item behavior remains unchanged**:
   - Added-but-unpaid experiences remain removable from Host Panel.
2. **BOOKED item behavior is strict**:
   - Host Panel CTA must render as `Booked` and be disabled.
   - Click handlers must be no-op for booked items.
3. **Trip ownership and auth checks remain enforced** on all trip/booking APIs.
4. **No hardcoded secrets** or Stripe credentials in source; Stripe keys remain env-driven.

## 5) Target State

### 5.1 Canonical status source
- Booking table remains the source of truth for payment/confirmation state.
- Itinerary item UI status is derived from linked bookings in trip API conversion.

### 5.2 UI status mapping (deterministic)
For each itinerary item:
- `BOOKED` if any linked booking has `status IN (CONFIRMED, COMPLETED)`.
- `PENDING` if no booked booking exists and any linked booking has `status IN (TENTATIVE, PENDING)` with `paymentStatus != FAILED`.
- `FAILED` if latest linked booking has `paymentStatus = FAILED`.
- `DRAFT` otherwise.

### 5.3 Candidate linkage invariant
- Every trip booking candidate created from an itinerary item must set `booking.itemId = itineraryItem.id`.
- For a given item, candidate creation must reuse existing active tentative candidate when present (idempotent behavior).

## 6) API/Data Contract Changes

### 6.1 `GET /api/trips/[tripId]`
Must include item bookings needed for projection:
- `stops.days.items.bookings` with at least:
  - `id`
  - `status`
  - `paymentStatus`
  - `updatedAt`

### 6.2 Trip converter
`convertTripToGlobeDestinations` must:
- derive `item.status` using mapping in §5.2;
- set `item.candidateId` to the active tentative booking id when present;
- preserve existing ordering and existing fallback behavior.

### 6.3 `POST /api/itinerary/candidates`
Must accept `itemId` for trip flow and:
- validate item belongs to requesting user’s trip/day;
- return existing tentative candidate for that item when present;
- otherwise create candidate linked to `itemId`.

## 7) UI Flow Requirements

### 7.1 Book action from itinerary item
- Client passes `itemId` to candidate endpoint.
- If `item.candidateId` exists and still tentative, reuse it.
- Avoid creating duplicate tentative bookings for the same item.

### 7.2 Payment success handling
- `Payment Successful` UI message must only be shown after persisted state confirms booking is reflected (`item.status === BOOKED` via refreshed trip data).
- If payment intent succeeds but projection is not yet available, show “Payment processing…” state and retry fetch for bounded window (e.g., up to 10s) before fallback messaging.

## 8) Non-Functional Constraints

- No weakening of existing auth/ownership checks.
- No breaking changes to unrelated trip planner interactions.
- Preserve existing component props unless required by this spec.
- Keep solution deterministic and testable without live Stripe secrets in tests.

## 9) Test Requirements (Definition of Done)

### 9.1 Unit tests (required)
- Converter status projection:
  - CONFIRMED booking -> item `BOOKED`
  - COMPLETED booking -> item `BOOKED`
  - TENTATIVE booking -> item `PENDING`
  - FAILED payment -> item `FAILED`
  - no bookings -> item `DRAFT`
- Candidate derivation:
  - active tentative booking sets `candidateId`
  - confirmed booking does not overwrite active tentative candidate selection logic
- Host panel state:
  - booked experience IDs include projected `BOOKED` items
  - CTA priority remains `BOOKED` > `REMOVE` > `ADD`

### 9.2 Integration/API tests (required)
- `POST /api/itinerary/candidates`:
  - reuses existing tentative candidate by `itemId`
  - creates linked candidate when absent
  - rejects cross-trip/cross-user `itemId`
- `GET /api/trips/[tripId]` includes bookings relation needed for status projection.

### 9.3 E2E tests (required)
- Flow: add experience -> book -> pay (mocked Stripe success) -> refresh -> Host Panel shows disabled `Booked` button.
- Flow: unbooked draft remains `Remove from Day`.
- Regression: no paid item can be removed from Host Panel CTA path.

## 10) Acceptance Criteria (Binary)

1. After successful booking payment and state refresh, Host Panel CTA for that experience is exactly `Booked` and disabled.
2. `Remove from Day` is only shown for non-booked added experiences.
3. Trip API + converter consistently project item status from Booking records.
4. Candidate bookings in trip flow are linked to itinerary items and reused idempotently.
5. All required unit, API/integration, and E2E tests pass.
6. No secrets are introduced in code/tests/config.

## 11) Explicit Exclusions

- No migration of Booking enum names (`CONFIRMED` remains backend value).
- No schema redesign of ItineraryItem to add persisted status column.
- No change to refund or cancellation business logic.
