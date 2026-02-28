# Runbook (Quick Fixes)

## Availability returns 403
1) Confirm you’re logged in as a host.
2) Ensure the experience belongs to that host.

## Seed fails
1) Check `DATABASE_URL`.
2) Run `npm run db:generate`.
3) Run `npm run db:seed`.

## Trip plan not saving
1) Verify `tripId` exists in Redux.
2) Ensure item types are valid enums.
3) Check `/api/trips/:tripId/plan` response body.

## Orchestrator job stuck
1) Confirm `/api/orchestrator?jobId=...` returns progress.
2) Check the `OrchestratorJob` table for the current `status` and `generationId`. If the `status` is `running` but the timestamp hasn't updated in 5 minutes, the process likely died.
3) Check server logs for `denied.stale-generation` to see if a background worker was rejected from overwriting a completed or out-of-date generation state.
4) Check server logs for tool failures.
