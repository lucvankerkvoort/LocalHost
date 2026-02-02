# Implementation Spec — Booking Management + Messaging Polishing

Date: 2026-02-01
Scope: Booking status clarity and messaging improvements

## Objective
Clarify booking state transitions and improve messaging experience for hosts and guests.

---

## Functional Requirements

1) **Booking confirmation policy**
- MVP: auto‑confirm upon payment success.

2) **Booking status visibility**
- Display status badges for host and guest views.

3) **Messaging templates (lightweight)**
- Provide a small set of pre‑filled prompts for common questions.

---

## Non‑Goals
- Push/email notifications.
- Full host accept/decline flows.

---

## API Changes
- Ensure booking status is updated consistently by webhook.
- Expose status in booking responses where relevant.

---

## UI Changes
- Add status badge in booking summaries.
- Add simple template buttons in chat input.

---

## Files to Change (Targeted)

- `src/components/features/booking-summary.tsx`
- `src/components/features/p2p-chat-panel.tsx`
- `src/app/api/webhooks/stripe/route.ts`

---

## Acceptance Criteria
1) Booking status is clearly visible.
2) Messaging works post‑confirmation only.
3) Templates are available for common questions.
