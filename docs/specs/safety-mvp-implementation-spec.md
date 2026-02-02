# Implementation Spec — Safety MVP

Date: 2026-02-01
Scope: Minimal safety features (reporting + emergency contact)

## Objective
Add baseline safety features required for trust and compliance.

---

## Functional Requirements

1) **Report flow**
- Users can report a host or experience from the detail page.
- Report submissions are stored for admin review.

2) **Emergency contact**
- Users can add/update an emergency contact on their profile.

---

## Non‑Goals
- Full moderation tooling.
- Check‑in/out.

---

## API Changes

- `POST /api/reports`
  - Accepts subject type + reason + description.
  - Requires auth.

- `PATCH /api/profile`
  - Save emergency contact fields.

---

## UI Changes
- Add “Report” CTA on experience detail + host profile.
- Add emergency contact fields on profile.

---

## Files to Change (Targeted)

- `src/app/api/reports/route.ts` (new)
- `src/app/api/profile/route.ts` (new)
- `src/app/profile/page.tsx` (add emergency contact UI)

---

## Acceptance Criteria
1) Reports can be submitted and stored.
2) Emergency contact can be saved and edited.
