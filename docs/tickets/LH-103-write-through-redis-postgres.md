# LH-103 — Implement write-through pattern: Redis to Postgres on save

| Field    | Value                  |
|----------|------------------------|
| Type     | Story                  |
| Priority | High                   |
| Points   | 3                      |
| Labels   | database, caching      |

## Description

Create a write-through persistence flow: during trip generation, all state lives in Redis. When the user explicitly saves or generation completes, the finalized trip JSON is written to the Postgres `trip_data` JSONB column. This ensures durability without making Postgres the bottleneck during generation. Include a fallback that flushes any orphaned Redis trip data to Postgres on a periodic sweep (e.g., every 30 min) to prevent data loss from crashes.

## Acceptance Criteria

- [ ] Trip save action writes finalized JSON from Redis to Postgres `trip_data`
- [ ] Background sweep identifies orphaned Redis keys older than 30 min and persists them
- [ ] User can close browser and reopen to find their saved trip intact in Postgres
- [ ] Redis eviction or restart does not lose any saved trips
- [ ] Logging in place for write-through success/failure events

## Notes

This is the safety net that makes the Redis-first approach viable. Without it, a Redis restart loses all in-progress work.

## Dependencies

- LH-101, LH-102 must be complete first
