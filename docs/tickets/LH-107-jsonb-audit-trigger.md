# LH-107 — Add JSONB pattern audit trigger at 100 saved trips

| Field    | Value                       |
|----------|-----------------------------|
| Type     | Task                        |
| Priority | Medium                      |
| Points   | 1                           |
| Labels   | database, technical-debt    |

## Description

Set a concrete trigger to revisit the JSONB-only schema. When the `trips` table reaches 100 rows, run an audit: extract the most frequently accessed JSONB fields, identify repeated query patterns, and evaluate which fields should be promoted to first-class columns or normalized tables. Document findings and create follow-up tickets. This prevents the JSONB blob from becoming a permanent unmaintainable data swamp.

## Acceptance Criteria

- [ ] Monitoring or alert set for `trips` table reaching 100 rows
- [ ] Audit query written that extracts top accessed JSONB paths
- [ ] Template for the audit report created (fields, access frequency, normalization candidates)
- [ ] Follow-up ticket creation process documented

## Notes

This is a discipline ticket. The whole point of the JSONB approach is to let production usage write your schema, but only if you actually look at the data and act on what you find.

## Dependencies

- LH-101 must be complete first
