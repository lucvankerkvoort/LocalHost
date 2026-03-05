# Action Plan (Next Work Items)

Date: 2026-02-01

This plan is ordered for maximum user-visible impact and to unblock core booking flows.

## 1) Stabilize Host Availability (Date-Only)
- Remove time-slot UI and storage assumptions.
- Enforce date-only availability writes and reads.
- Ownership gate: show friendly "not your experience" state.

Why first: Availability is a core dependency for booking and host trust.

## 2) Fix Stripe Connect Onboarding
- Verify auth + user record presence during connect.
- Validate Stripe keys and onboarding return URLs.
- Ensure host experiences list only includes owned experiences.

Why: Payments are the core marketplace function and currently blocked.

## 3) Trip-Only Booking Flow Alignment
- Ensure booking goes through candidates only (no direct /api/bookings in trip flow).
- Payment modal must receive bookingId from candidate.
- Chat unlocks only after confirmation (payment success).

Why: Current flow is inconsistent and causes broken user experiences.

## 4) Traveler-Facing Experience Detail + Discovery
- Add browse/listing page for experiences.
- Add experience detail page with host info and availability date picker.
- Connect booking to date-only availability.

Why: Core guest discovery is missing outside the trip planner.

## 5) Booking Management + Messaging Polishing
- Host accept/decline or auto-confirm logic (define MVP rule).
- Basic messaging templates and indicators.

Why: Improves clarity and reduces support burden.

## 6) Reviews MVP
- Implement review submission after completed booking.
- Display reviews on experience detail page.

Why: Trust and conversion improve once transactions are real.

## 7) Safety MVP (Minimal)
- Report user/experience flow.
- Emergency contact fields (profile).

Why: Required for trust and compliance before scaling.

---

## Suggested Milestone Order
1) Availability + Stripe Connect (blockers)
2) Trip booking consistency
3) Experience detail + discovery
4) Booking management + messaging polish
5) Reviews MVP
6) Safety MVP
