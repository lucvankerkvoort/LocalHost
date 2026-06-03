# LH-105 — Implement model tiering: Haiku for suggestions, Sonnet for planning

| Field    | Value                      |
|----------|----------------------------|
| Type     | Story                      |
| Priority | High                       |
| Points   | 3                          |
| Labels   | cost-optimization, ai      |

## Description

Not every AI task needs the same model. Route lightweight tasks (restaurant suggestions near a pin, activity descriptions, single-field autocompletes) to Haiku, and reserve Sonnet for full day-plan generation where reasoning quality matters. Create a simple router utility that accepts a task type enum and returns the appropriate model string. This directly reduces per-request cost by 10–20x on suggestion calls.

## Acceptance Criteria

- [ ] Task router utility created with at least two tiers: `light` (Haiku) and `full` (Sonnet)
- [ ] Suggestion/autocomplete endpoints route to Haiku
- [ ] Day-plan and itinerary generation routes to Sonnet
- [ ] Cost per suggestion call reduced by at least 5x compared to current baseline
- [ ] Response quality for suggestions is acceptable on Haiku (manual QA pass)

## Notes

Track cost-per-task in logging so you can see the actual savings and identify candidates to move between tiers.

## Dependencies

- Independent — can be done after LH-101/102/103
