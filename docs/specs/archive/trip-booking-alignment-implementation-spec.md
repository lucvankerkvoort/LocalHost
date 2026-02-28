# Implementation Spec — Trip‑Only Booking Flow Alignment

Date: 2026-02-01
Scope: Trip booking flow, candidate creation, payment handoff, chat gating

## Objective
Unify trip booking so it only uses candidate bookings, and chat unlocks only after confirmed payment.

---

## Functional Requirements

1) **Trip flow must not call /api/bookings directly**
- All trip bookings are created or fetched via `/api/itinerary/candidates`.

2) **Candidate booking is the single entry point**
- Candidate creation returns a Booking (status TENTATIVE).
- Candidate is reused if it already exists for a trip item.

3) **Payment modal opens with bookingId**
- The payment modal is only opened with a `bookingId` from the candidate.

4) **Chat unlocks only after confirmation**
- Chat endpoints must require booking status `CONFIRMED` or `COMPLETED`.

---

## Non‑Goals
- No non‑trip booking flow.
- No new payment features.

---

## API Changes

### `POST /api/itinerary/candidates`
- Create or return an existing booking candidate for the itinerary item.
- Ensure booking has `amountSubtotal`, `currency`, `hostId`, `experienceId`, `guestId`.

### `POST /api/bookings/{bookingId}/pay`
- Reject if booking is not TENTATIVE.
- Reject if user is not the booking guest.
- Reject if host is not onboarded.

### `GET/POST /api/bookings/{bookingId}/messages`
- Reject if booking status is not CONFIRMED/COMPLETED.

---

## UI Changes

- Trip itinerary booking dialog must create/fetch candidate first.
- On confirm: open payment modal using the candidate’s bookingId.
- Reset booking/payment modal state on close and trip change.

---

## Files to Change (Targeted)

- `src/components/features/globe-itinerary.tsx`
- `src/hooks/use-experience-candidates.ts`
- `src/app/api/itinerary/candidates/route.ts`
- `src/app/api/bookings/[bookingId]/pay/route.ts`
- `src/app/api/bookings/[bookingId]/messages/route.ts`
- `src/components/features/payment/payment-modal.tsx`

---

## Acceptance Criteria
1) Booking from trip creates candidate first, then payment.
2) Chat is blocked until payment confirmation.
3) No trip flow uses `/api/bookings` directly.
