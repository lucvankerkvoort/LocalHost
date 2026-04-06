# LH-102 — Set up Redis caching layer for AI responses

| Field    | Value                      |
|----------|----------------------------|
| Type     | Story                      |
| Priority | Critical                   |
| Points   | 5                          |
| Labels   | caching, infrastructure    |

## Description

Introduce Redis as the caching and ephemeral state layer. Cache AI-generated itinerary responses with a composite key (destination + parameters hash) and a configurable TTL. Use Redis to hold in-progress generation state during chunked/streaming builds. Once generation completes or the user saves, persist the final blob to Postgres. This reduces redundant API calls and absorbs repeated queries for popular destinations.

## Acceptance Criteria

- [ ] Redis instance provisioned and connected to the application
- [ ] AI responses cached with composite key (destination + param hash)
- [ ] TTL configurable per cache type (default 24h for itineraries)
- [ ] In-progress generation chunks stored in Redis during streaming
- [ ] Cache hit skips AI call entirely and returns stored response
- [ ] Cache miss falls through to AI generation then writes to cache

## Notes

Use a key prefix convention like `ai:itinerary:{hash}` and `gen:progress:{tripId}` so keys are scannable and debuggable.

## Dependencies

- LH-101 must be complete first
