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
2) Check server logs for tool failures.

## Can't log in on Netlify
1) In Netlify env vars, set `AUTH_SECRET` (required).
2) Set `AUTH_TRUST_HOST=true` so Auth.js trusts forwarded host headers.
3) Set `AUTH_URL` to your deployed site URL (for example `https://your-site.netlify.app`).
4) Redeploy the site after changing env vars.
