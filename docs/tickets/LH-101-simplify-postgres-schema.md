# LH-101 — Simplify Postgres schema to 3-table JSONB model

| Field    | Value                    |
|----------|--------------------------|
| Type     | Story                    |
| Priority | Critical                 |
| Points   | 5                        |
| Labels   | database, architecture   |

## Description

Replace the current normalized schema with three tables: `users`, `trips`, and `trip_data`. The `trip_data` table stores the full AI-generated itinerary as a JSONB blob. This eliminates migration churn, removes complex joins, and lets the data shape evolve freely during the prototype phase. Add a GIN index on the JSONB column so we can still query into the blob when needed for analytics or debugging.

## Acceptance Criteria

- [ ] Schema reduced to `users`, `trips`, and `trip_data` tables
- [ ] `trip_data` column is JSONB with a GIN index
- [ ] Existing trip data migrated into the new JSONB structure
- [ ] No relational joins required for core read/write paths
- [ ] `EXPLAIN ANALYZE` on primary queries shows index usage, no sequential scans

## Notes

This is the foundation ticket. All other tickets depend on this being completed first. Back up existing data before migration.
