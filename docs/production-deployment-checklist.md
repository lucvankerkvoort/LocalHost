# LocalHost — Production Deployment Checklist

> Full analysis of the codebase for production readiness on Netlify/serverless.
> Last updated: 2026-02-25

---

## 🔴 Critical Blockers

These must be resolved before production deployment.

### 1. In-Memory State (Serverless-Incompatible)

The following modules use in-process `Map` singletons that **reset on every cold start** and are **not shared across instances**:

| Module | File | Impact |
|--------|------|--------|
| `ConversationController` | [controller.ts](file:///Users/lucvankerkvoort/Documents/LocalHost/src/lib/conversation/controller.ts) | Chat session intent tracking lost between requests |
| `GenerationController` | [generation-controller.ts](file:///Users/lucvankerkvoort/Documents/LocalHost/src/lib/agents/generation-controller.ts) | Active generation tasks, abort controllers, debounce timers lost |
| Rate Limiter | [rate-limit.ts](file:///Users/lucvankerkvoort/Documents/LocalHost/src/lib/api/rate-limit.ts) | Rate limits reset on each cold start — no protection |
| `resolve_place` cache | [resolve-place.ts](file:///Users/lucvankerkvoort/Documents/LocalHost/src/lib/ai/tools/resolve-place.ts) | Geocoding results not shared (minor — just re-fetches) |
| Route service cache | [route-service.ts](file:///Users/lucvankerkvoort/Documents/LocalHost/src/lib/ai/services/route-service.ts) | Route computations not shared (minor — just re-fetches) |
| Host markers cache | [host-markers.ts](file:///Users/lucvankerkvoort/Documents/LocalHost/src/lib/ai/host-markers.ts) | Host marker hashing not shared (minor) |

**Action items:**
- [ ] **P0**: Replace `ConversationController` in-memory `Map` → **Prisma DB-backed** (no Redis — simpler for Netlify)
- [ ] **P0**: Replace `GenerationController` in-memory `Map` → DB-backed generation records (or accept that generation tasks must complete within a single invocation)
- [ ] **P1**: Replace rate limiter → DB-backed or [Upstash `@upstash/ratelimit`](https://github.com/upstash/ratelimit)
- [ ] **P1**: Add a `PlaceCache` table — store resolved geocoding results (name, lat/lng, category, address) so future trips to the same destinations reuse cached data instead of calling Google Places API again. Saves API costs + reduces token usage

### 2. Background Task Execution

Long-running AI orchestration (drafting + hydrating itineraries) currently runs as fire-and-forget promises. Vercel terminates execution after the response is sent unless `next/after` is used.

**Current state:**
- ✅ `api/orchestrator/route.ts` — uses `after()` for session persistence
- ❌ `api/chat/route.ts` — has `maxDuration = 300` (5 min) but planning agent generation is spawned via `GenerationController` which fires async promises that may outlive the request

**Action items:**
- [ ] **P0**: Audit `GenerationController.startGenerationNow()` — ensure the full generation lifecycle (draft → hydrate → complete) finishes within the request or is wrapped in `after()`
- [ ] **P0**: Verify `maxDuration = 300` — requires **Vercel Pro plan** (free tier caps at 60s)
- [ ] **P1**: Add timeout guards so failed generations don't leave orphaned jobs in `running` state forever

### 3. Static Host Data

[semantic-search.ts](file:///Users/lucvankerkvoort/Documents/LocalHost/src/lib/semantic-search.ts) imports from [hosts.ts](file:///Users/lucvankerkvoort/Documents/LocalHost/src/lib/data/hosts.ts) (303-line static file). This is fine for MVP but won't scale.

- [ ] **P1**: Migrate host search to use Prisma queries against the database `User` + `Experience` tables
- [ ] **P2**: Consider vector search (pgvector / Pinecone) for true semantic host matching

---

## 🟡 Important (Pre-Launch)

### 4. Environment & Secrets

[.env.example](file:///Users/lucvankerkvoort/Documents/LocalHost/.env.example) is well-documented. Ensure all are set in Vercel:

- [ ] `DATABASE_URL` — Must be a **Prisma Accelerate** URL (`prisma://...`) for connection pooling
- [ ] `AUTH_SECRET` — Generate with `openssl rand -base64 32`
- [ ] `AUTH_TRUST_HOST=true`
- [ ] `AUTH_URL` — Set to production domain (e.g. `https://localhost.app`)
- [ ] `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — Production OAuth credentials
- [ ] `OPENAI_API_KEY` — Production key with appropriate rate limits
- [ ] `STRIPE_SECRET_KEY` — **Live mode** key (not `sk_test_`)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — **Live mode** publishable key
- [ ] `STRIPE_WEBHOOK_SECRET` — Register production webhook endpoint in Stripe Dashboard
- [ ] `GOOGLE_PLACES_API_KEY` — Production key with billing enabled
- [ ] `GOOGLE_ROUTES_API_KEY` — Optional dedicated key
- [ ] `UNSPLASH_ACCESS_KEY` — Optional, for fallback images

### 5. Database

- [ ] Run `prisma migrate deploy` (not `db push`) for production migrations
- [ ] Verify connection pooling via Prisma Accelerate or Supabase pooler (port 6543)
- [ ] Set up database backups and point-in-time recovery
- [ ] Review indexes on frequently queried tables (`Trip`, `Booking`, `OrchestratorJob`, `User`)
- [ ] Add `OrchestratorJob` cleanup cron — stale jobs accumulate with no TTL currently

### 6. Stripe

- [ ] Switch from test to **live** API keys
- [ ] Register production webhook URL: `https://yourdomain.com/api/webhooks/stripe`
- [ ] Verify webhook events: `account.updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`
- [ ] Test full booking → payment → payout flow in Stripe test mode first
- [ ] Ensure `STRIPE_WEBHOOK_SECRET` matches the production endpoint

### 7. Authentication

- [ ] Verify Google OAuth redirect URIs include production domain
- [ ] Set `AUTH_URL` to production URL
- [ ] Confirm `AUTH_TRUST_HOST=true` for reverse proxy / Vercel
- [ ] Review session strategy (JWT vs database sessions)

### 8. Cesium / Static Assets

Cesium assets are copied to `public/cesium/` via `postinstall` script.

- [ ] Verify `postinstall` runs during Vercel build (`scripts/copy-cesium-assets.mjs`)
- [ ] Or: consider loading Cesium from CDN to reduce bundle size (~30MB in `public/`)
- [ ] Confirm `CESIUM_BASE_URL="/cesium"` works with Vercel's static file serving

---

## 🟢 Nice-to-Have (Post-Launch)

### 9. Observability & Error Tracking

- [ ] Add error tracking (Sentry, LogRocket, or Vercel's built-in)
- [ ] Replace `console.log` / `console.warn` with structured logging (18+ console calls in `orchestrator.ts` alone)
- [ ] Add performance monitoring for AI API calls (OpenAI, Google Places)
- [ ] Set up alerts for: failed orchestrator jobs, Stripe webhook failures, auth errors

### 10. Security Hardening

- [x] Security headers configured in `next.config.ts` (HSTS, X-Frame-Options, etc.)
- [ ] Add CSP (Content-Security-Policy) header — currently missing
- [ ] Audit all API routes for proper auth checks
- [ ] Rate limit the Stripe webhook endpoint
- [ ] Remove `api/debug/` route in production
- [ ] Ensure `api/admin/` routes require admin role verification
- [ ] Review CORS policy for API routes
- [ ] Add input validation/sanitization on user-facing API inputs

### 11. Performance

- [ ] Review Cesium bundle size — consider lazy loading or CDN
- [ ] Set `Cache-Control` headers on static assets
- [ ] Review image optimization — currently using `remotePatterns` for Unsplash and ui-avatars
- [ ] Consider ISR/SSG for marketing pages

### 12. CI/CD & Testing

- [ ] Run `npm run build` successfully with production env vars
- [ ] Run `npm test` in CI pipeline
- [ ] Add Playwright E2E tests to CI (`@playwright/test` is in devDeps)
- [ ] Set up preview deployments for PRs
- [ ] Add health check endpoint (`/api/health`)

---

## Deployment Steps (Vercel)

```
1. Push code to GitHub
2. Connect repo to Vercel
3. Set all environment variables (see §4 above)
4. Ensure build command: `prisma generate && next build`
5. Verify postinstall copies Cesium assets
6. Run `prisma migrate deploy` against production DB
7. Seed production data if needed (`npm run db:seed`)
8. Register Stripe webhook endpoint
9. Configure Google OAuth redirect URIs
10. Deploy and verify
```
