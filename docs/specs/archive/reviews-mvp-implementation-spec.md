# Implementation Spec — Reviews MVP

Date: 2026-02-01
Scope: Two‑way reviews after completed booking

## Objective
Enable basic review creation and display after booking completion.

---

## Functional Requirements

1) **Guest → Host review**
- Guest can review after booking status `COMPLETED`.

2) **Host → Guest review**
- Host can review after booking status `COMPLETED`.

3) **Review display**
- Reviews shown on experience detail page.

---

## Non‑Goals
- Moderation workflows.
- Review editing/deletion.

---

## API Changes

- `POST /api/reviews`
  - Validate booking ownership and completion.
  - Create review tied to booking + experience.

- `GET /api/reviews?experienceId=...`
  - Return list + aggregate rating.

---

## UI Changes
- Review form (post‑completion).
- Reviews section on experience detail page.

---

## Files to Change (Targeted)

- `src/app/api/reviews/route.ts` (new)
- `src/components/features/reviews-section.tsx` (wire data)
- `src/app/experiences/[experienceId]/page.tsx` (display reviews)

---

## Acceptance Criteria
1) Reviews can only be created after completion.
2) Reviews appear on experience detail page.
