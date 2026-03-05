# Technical Specification - Friends & Family Readiness: Rich Seed Data + Synthetic Host Bots

## 1) Problem Statement
Current core loops exist (experience creation, trip creation, itinerary linking, booking, messaging), but the product is not ready for friends/family because:
1. The seeded catalog is too shallow for realistic choice density.
2. Messaging requires hosts to manually respond; synthetic hosts need autonomous replies.

This spec defines the architecture to deliver:
- A high-density, realistic seeded marketplace.
- Bot-backed synthetic hosts that can reply in booking chat threads.

---

## 2) Scope

### In Scope
- Deterministic, scalable seeding architecture for users/hosts/experiences/availability/trips/bookings/messages.
- Synthetic-host identity model and bot reply pipeline.
- Chat bot orchestration for confirmed bookings.
- Seed profiles for dev/demo/staging environments.
- Validation and acceptance checks for seed quality and bot behavior.

### Out of Scope
- Replacing existing booking/payment lifecycle.
- Reworking agent-router personas for trip planning/host onboarding.
- Full moderation platform redesign.
- Native mobile push infrastructure.

---

## 3) Existing Contract to Preserve (Must Not Change)
1. Booking/payment lifecycle remains `TENTATIVE -> CONFIRMED` via Stripe webhook.
2. Booking chat gate remains enforced: only `CONFIRMED`/`COMPLETED` can chat.
3. Existing E2E deterministic IDs/scenarios remain valid.
4. Existing `/become-host` and trip planning flows remain source-compatible.
5. No destructive changes to current `db:seed:staging` test fixtures.

---

## 4) Current Baseline (Evidence)
- Seed scripts exist: `prisma/seed.ts`, `prisma/seed-staging.ts`.
- Host catalog source exists and is large enough to scale from: `src/lib/data/hosts.ts`, `src/lib/data/generated-hosts.json`.
- Booking chat API exists with status gate: `src/app/api/bookings/[bookingId]/messages/route.ts`.
- No bot responder pipeline exists yet (candidate chat routes are placeholders): `src/app/api/chat/[candidateId]/messages/route.ts`.

---

## 5) Target Architecture

### 5.1 Seed Data Architecture

#### 5.1.1 Seed Profiles
Define 3 explicit seed profiles:
- `dev-lite`: fast local seed, low volume.
- `demo-rich`: friends/family dataset, realistic volume.
- `staging-e2e`: deterministic QA scenarios (existing behavior preserved).

#### 5.1.2 Seed Volume Targets (demo-rich)
- Synthetic hosts: **250**
- Experiences: **750+** (avg 3 per host)
- Availability entries: **90 days** rolling, min 2 slots/day/experience equivalent in date-level availability
- Synthetic travelers: **120**
- Trips: **200**
- Bookings: **1,500** mixed states
- Messages: **6,000+**

#### 5.1.3 Data Composition Rules
- Geographic spread: min 30 cities, no single city > 15% of experiences.
- Category distribution: each PRD category represented, none < 8%.
- Price bands: budget/mid/premium distribution enforced.
- Ratings/reviewCount distributions non-uniform (avoid synthetic flatness).
- Host language/interests diversity enforced.

#### 5.1.4 Determinism + Idempotency
- All synthetic IDs generated from stable seeds (hash-based).
- Rerun-safe upsert strategy for seed entities.
- E2E scenario IDs remain fixed and isolated.

### 5.2 Synthetic Host Bot Architecture

#### 5.2.1 Data Model Additions
Add explicit synthetic-host metadata (DB-backed):
- `User.isSyntheticHost: boolean`
- `User.syntheticBotEnabled: boolean`
- `User.syntheticPersonaKey: string?`
- `User.syntheticResponseStyle: enum` (friendly/professional/concise/warm)
- `User.syntheticResponseLatencyMinSec`, `User.syntheticResponseLatencyMaxSec`

Add reply queue table:
- `SyntheticReplyJob`
  - `id`
  - `bookingId`
  - `hostId`
  - `triggerMessageId` (user message that caused reply)
  - `status` (`PENDING|PROCESSING|DONE|FAILED|CANCELLED`)
  - `dueAt`
  - `attemptCount`
  - `error`
  - unique `(bookingId, triggerMessageId)` for dedupe.

#### 5.2.2 Reply Generation Boundary
A new service boundary: `SyntheticHostResponder`
- Input: booking context + host persona + recent message window.
- Output: single host reply text.
- Guardrails:
  - Never claims to be human.
  - Never asks for off-platform payment/contact.
  - Respects booking context and itinerary facts.
  - Max length + tone constraints.

Generation strategy:
1. Primary: deterministic template+persona engine (fast, cheap, predictable).
2. Optional upgraded mode: LLM response with strict prompt schema + safety post-filter.
3. Hard fallback: canned contextual response if generation fails.

#### 5.2.3 Runtime Flow
1. User posts message to booking chat API.
2. API persists user message.
3. If booking host is synthetic and bot enabled, enqueue `SyntheticReplyJob` with delayed `dueAt`.
4. Job processor picks due jobs, generates reply, writes `Message` as host sender, marks job done.
5. Thread unread counts update via existing client behavior.

#### 5.2.4 Job Processing Model
Use DB-queue processor with two triggers:
- Opportunistic trigger on chat GET/POST.
- Scheduled cron processor endpoint for reliability.

No in-memory queue dependency (must survive restarts/serverless).

---

## 6) Environment Contracts

### 6.1 Feature Flags
- `SYNTHETIC_BOTS_ENABLED=true|false`
- `SYNTHETIC_BOTS_PROFILE=dev-lite|demo-rich|staging-e2e`
- `SYNTHETIC_BOTS_USE_LLM=true|false`
- `SYNTHETIC_BOTS_MAX_RETRIES`

### 6.2 Safety Defaults
- Bots disabled in production by default until explicitly enabled.
- Synthetic users must never be payout-enabled in demo environments.
- Synthetic emails must use reserved domain namespace.

---

## 7) Invariants
1. Bot replies only for synthetic hosts.
2. Bot replies only in chat-eligible bookings (`CONFIRMED|COMPLETED`).
3. Exactly one bot reply job per triggering user message (dedupe guaranteed).
4. No bot-to-bot loops.
5. Seed reruns do not duplicate entities.
6. Existing E2E fixtures pass unchanged.

---

## 8) Test Requirements (Definition of Correctness)

### 8.1 Unit
- Seed distribution calculators (city/category/price).
- Synthetic reply job dedupe logic.
- Persona style renderer and fallback behavior.
- Guardrail filters.

### 8.2 Integration
- POST chat message -> reply job created for synthetic host.
- Processor writes host message and marks job `DONE`.
- Human host message does not create reply job.
- Duplicate user message trigger does not create duplicate bot replies.

### 8.3 E2E
- Seeded catalog browse shows broad option density.
- Confirmed booking chat receives delayed synthetic reply.
- Tentative booking chat remains locked.
- Existing staging scenario tests remain green.

---

## 9) Acceptance Criteria (Binary)
1. `demo-rich` seed produces at least target minimum counts across all core entities.
2. Seed rerun is idempotent (count drift <= expected updates, no uncontrolled duplicates).
3. Sending a message to a synthetic host in confirmed booking yields bot reply within SLA (e.g., <= 30s).
4. Sending a message to a human host does not trigger synthetic responder.
5. No synthetic reply appears for non-chat-eligible bookings.
6. Existing `db:seed:staging` scenarios and IDs remain intact.
7. All unit/integration/E2E tests for this scope pass.

---

## 10) Rollout Plan
1. Implement schema + seed profile framework.
2. Enable `demo-rich` seed in local/dev only; validate data quality dashboard checks.
3. Add synthetic responder in shadow mode (enqueue/process/log, no visible replies).
4. Enable visible replies for dev/demo environments.
5. Friends/family launch gate: acceptance criteria all green.
