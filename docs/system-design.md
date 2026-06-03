# System Design Document

## AI Travel App — High-Level Architecture

**Version:** 1.0  
**Status:** Draft  
**Audience:** Engineering, Design, Product (Solo Founder)  
**Last Updated:** March 2026

---

## 1. System Overview

The platform is a full-stack Next.js web application with three primary actors — **Travelers**, **Hosts**, and the **AI layer** — operating across a shared data infrastructure. The system is designed for solo-founder velocity: a single deployable unit, minimal ops overhead, and clear seams for future scaling.

```
┌─────────────────────────────────────────────────────┐
│                   Next.js App                        │
│  ┌──────────────┐          ┌──────────────────────┐  │
│  │  Traveler UI │          │      Host UI          │  │
│  │  (Globe +    │          │  (Experience Builder  │  │
│  │   Itinerary) │          │   + Dashboard)        │  │
│  └──────┬───────┘          └──────────┬────────────┘  │
│         │                             │               │
│  ┌──────▼─────────────────────────────▼────────────┐  │
│  │            API Routes / Server Actions           │  │
│  │   Itinerary │ Booking │ Chat │ Host │ Images     │  │
│  └──────┬──────────────────────────────────────────┘  │
└─────────┼───────────────────────────────────────────┘
          │
    ┌─────▼──────────────────────────────────┐
    │           External Services             │
    │  Claude API │ Stripe │ Image APIs       │
    └────────────────────────────────────────┘
          │
    ┌─────▼──────────────────────────────────┐
    │           Data Layer                    │
    │  PostgreSQL + PostGIS (via Prisma)      │
    └────────────────────────────────────────┘
```

---

## 2. Frontend Architecture

### 2.1 Rendering Strategy

The app uses Next.js App Router with a hybrid rendering model:

| Route                           | Strategy                          | Reason                                      |
| ------------------------------- | --------------------------------- | ------------------------------------------- |
| `/` (home / itinerary creation) | Client Component                  | Real-time AI streaming, globe interactivity |
| `/trip/[id]`                    | Client Component                  | Globe + live itinerary state                |
| `/host/dashboard`               | Server Component + Client islands | Form submissions, data-heavy                |
| `/host/[id]` (profile)          | Server Component                  | Static-ish, SEO-ready post-MVP              |
| `/booking/[id]`                 | Server Component + Client         | Confirmation display                        |

### 2.2 State Management

Redux manages global client state. Key slices:

- **`itinerarySlice`** — current trip structure (days, items, metadata), AI update status, optimistic update queue
- **`globeSlice`** — active pins, camera target, interaction state
- **`chatSlice`** — active thread, message list, polling status
- **`userSlice`** — auth session, role (traveler/host)

### 2.3 Globe (Cesium / Resium)

The 3D globe is a controlled React component driven by `globeSlice`. Key behaviors:

- On itinerary load → camera flies to trip region, pins render for each destination
- On day card hover/select → camera focuses on that day's destinations
- On pin click → popover with destination summary + linked experiences
- Globe state is **derived** from itinerary state, never the source of truth

### 2.4 AI Itinerary Update Safety

Sequential AI calls are the primary frontend risk. The mitigation pattern:

```
User action → dispatch to queue → serialize execution → optimistic UI update
                                        ↓
                              Single in-flight request at a time
                                        ↓
                              On success: commit to Redux + DB
                              On failure: rollback to last stable state
```

Debounce rapid user inputs (e.g., 800ms) before dispatching an AI update.

---

## 3. Backend Architecture

### 3.1 API Surface

All backend logic lives in Next.js API routes or Server Actions, grouped by domain:

| Domain        | Routes / Actions                                               | Responsibility                     |
| ------------- | -------------------------------------------------------------- | ---------------------------------- |
| **Itinerary** | `POST /api/itinerary`, `PATCH /api/itinerary/[id]`             | Create, update, AI orchestration   |
| **AI**        | `POST /api/ai/generate`, `POST /api/ai/update`                 | Claude API calls, response parsing |
| **Host**      | `POST /api/host/experience`, `PATCH /api/host/experience/[id]` | Experience CRUD                    |
| **Booking**   | `POST /api/booking`, `GET /api/booking/[id]`                   | Create booking, status             |
| **Chat**      | `GET /api/chat/[threadId]`, `POST /api/chat/[threadId]`        | Message fetch + send               |
| **Images**    | `GET /api/images/[destinationId]`                              | Resolve + cache destination images |
| **Stripe**    | `POST /api/stripe/connect`, `POST /api/stripe/webhook`         | Onboarding, payment, webhooks      |

### 3.2 AI Orchestration Layer

The AI layer is the core of the product. It sits between the API routes and the Claude API:

```
API Route (generate/update)
        │
        ▼
┌───────────────────────────────────┐
│         AI Orchestrator           │
│                                   │
│  1. Build system prompt           │
│  2. Inject user context           │
│  3. Query host experiences DB     │
│     (by destination/dates)        │
│  4. Inject matched experiences    │
│     into prompt context           │
│  5. Call Claude API               │
│  6. Parse structured response     │
│  7. Validate + merge into         │
│     itinerary state               │
└───────────────────────────────────┘
        │
        ▼
  Return structured itinerary delta to client
```

**Host experience injection** is what differentiates the AI output from generic suggestions. Before calling Claude, the orchestrator runs a DB query for published experiences matching the trip's destinations and date range, then passes them as structured context so Claude can weave them into the itinerary naturally.

### 3.3 Image Resolution Pipeline

Images are resolved lazily and cached aggressively to avoid hammering external APIs:

```
Request for destination images
        │
        ▼
Check in-memory cache (LRU)
        │ miss
        ▼
Check DB cache (Destination.images)
        │ miss
        ▼
Wikimedia API (coordinate-based geo search)
        │ fail / low quality
        ▼
Unsplash API
        │ fail
        ▼
Pexels API
        │ fail
        ▼
Generic placeholder
        │
        ▼
Store result in DB cache + in-memory cache
```

Cache TTL: 7 days at the DB layer. In-memory cache is process-scoped (resets on deploy).

---

## 4. Data Architecture

### 4.1 Schema Overview

```
User
 ├── Trip (traveler)
 │    └── ItineraryDay[]
 │         └── ItineraryItem[]
 │              ├── → Destination (reusable)
 │              └── → Experience (optional, host-owned)
 │
 └── Experience[] (host)
      └── Booking[]
           └── Message[]
```

### 4.2 Key Design Decisions

**Destination vs. ItineraryItem separation**  
`Destination` is a reusable knowledge record (coordinates, canonical name, images, metadata) shared across trips. `ItineraryItem` is trip-specific and references a Destination. This avoids duplicating geo data per trip and enables future cross-trip queries (e.g., "most visited cities").

**PostGIS for spatial queries**  
Host experience matching uses PostGIS `ST_DWithin` queries to find experiences within a radius of each itinerary destination's coordinates. This is more reliable than string-matching city names.

**Stripe data ownership**  
Stripe is the source of truth for payment state. The DB stores `stripePaymentIntentId` and `stripeConnectAccountId` as references, not duplicated payment data. Booking status is updated via Stripe webhooks.

### 4.3 Prisma Schema (Simplified)

```prisma
model User {
  id         String       @id
  role       Role         // TRAVELER | HOST
  trips      Trip[]
  experiences Experience[]
}

model Trip {
  id     String         @id
  userId String
  days   ItineraryDay[]
}

model ItineraryDay {
  id     String          @id
  tripId String
  date   DateTime
  items  ItineraryItem[]
}

model ItineraryItem {
  id            String      @id
  dayId         String
  destinationId String
  experienceId  String?     // null if no host experience linked
  destination   Destination @relation(...)
  experience    Experience? @relation(...)
}

model Destination {
  id          String   @id
  name        String
  lat         Float
  lng         Float
  images      Json?    // cached image URLs
  items       ItineraryItem[]
}

model Experience {
  id          String    @id
  hostId      String
  title       String
  description String
  lat         Float
  lng         Float
  price       Int       // cents
  status      ExperienceStatus  // DRAFT | PUBLISHED
  bookings    Booking[]
}

model Booking {
  id                   String   @id
  experienceId         String
  travelerId           String
  stripePaymentIntentId String
  status               BookingStatus
  messages             Message[]
}
```

---

## 5. External Integrations

### 5.1 Claude API

- Used for: itinerary generation, itinerary updates
- Model: `claude-sonnet-4-20250514`
- Calls are made server-side only (API key never exposed to client)
- Responses are expected as structured JSON (itinerary delta format)
- Streaming is desirable for generation UX but not required for MVP

### 5.2 Stripe Connect

- Account type: Express (fastest onboarding for hosts)
- Flow: Host initiates → redirect to Stripe hosted onboarding → webhook confirms activation
- Platform collects payment from traveler via Payment Intent
- Stripe routes payout to host's connected account minus platform fee
- Webhook events handled: `payment_intent.succeeded`, `account.updated`

### 5.3 Image APIs

| Service           | Auth          | Usage                                 |
| ----------------- | ------------- | ------------------------------------- |
| Wikimedia Commons | None (public) | Primary — geo-tagged image search     |
| Unsplash          | API key       | Secondary — keyword + location search |
| Pexels            | API key       | Tertiary — keyword fallback           |

All keys stored as environment variables, never in client bundles.

---

## 6. Auth & Security

- Auth handled via Next.js session (NextAuth or equivalent)
- Role-based access: `TRAVELER` and `HOST` roles gate API routes
- Host-owned resources (experiences, bookings) validate `userId` ownership server-side on every mutation
- Stripe webhook endpoint validates `stripe-signature` header
- Claude API key and image API keys are server-side env vars only
- No PII stored beyond what's required for booking (name, email via auth provider)

---

## 7. Deployment & Infrastructure

### 7.1 Target Setup (MVP)

| Concern            | Solution                                         |
| ------------------ | ------------------------------------------------ |
| Hosting            | Vercel (Next.js native)                          |
| Database           | Supabase or Railway (managed Postgres + PostGIS) |
| Environment config | Vercel env vars                                  |
| CI/CD              | Vercel Git integration (push to main = deploy)   |
| Monitoring         | Vercel Analytics + basic error logging           |

### 7.2 Environment Variables

```
# AI
ANTHROPIC_API_KEY

# Payments
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# Images
UNSPLASH_ACCESS_KEY
PEXELS_API_KEY

# Database
DATABASE_URL

# Auth
NEXTAUTH_SECRET
NEXTAUTH_URL
```

---

## 8. Key Architectural Risks

| Risk                             | Impact                                           | Mitigation                                                         |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| AI update race conditions        | Corrupted itinerary state, broken globe          | Serialize updates via queue; debounce inputs; optimistic rollback  |
| Claude API latency               | Poor UX on itinerary generation                  | Stream response where possible; show skeleton UI during generation |
| PostGIS not available on DB host | Experience matching falls back to string queries | Verify PostGIS extension on chosen DB provider before launch       |
| Stripe webhook missed            | Booking stuck in pending state                   | Idempotent webhook handler; fallback polling on booking status     |
| Image API quota exhaustion       | Broken destination images                        | DB-level cache with long TTL; city-level batching to reduce calls  |

---

## 9. Core User Flow: Question → Complete Itinerary

This is the most critical flow in the product. Every architectural decision in sections 2–4 exists to support it.

### 9.1 Overview

```
User types prompt
      │
      ▼
Phase 1 — Input Collection (Client)
Phase 2 — Prompt Construction (Server, parallel)
Phase 3 — Streaming Generation (Claude API → SSE → Client)
Phase 4 — Persistence (Server, async after stream completes)
Phase 5 — Globe Render (Client, incremental)
```

### 9.2 Phase 1 — Input Collection (Client)

Single conversational prompt input. No forms. The AI infers what it can; asks inline follow-ups only when strictly required.

**Minimum viable input to trigger generation:**

| Field | Required | Source |
|-------|----------|--------|
| Destination | Yes | User prompt |
| Dates / duration | Yes | User prompt |
| Party size | No | Inferred or asked inline |
| Interests / travel style | No | Inferred from prompt |
| Budget | No | Inferred or ignored |

### 9.3 Phase 2 — Prompt Construction (Server)

Three operations run **in parallel** before the Claude call:

1. **Parse user input** — extract destination, dates, party size, interests into structured fields
2. **Query host experiences** — PostGIS `ST_DWithin` lookup for published experiences near the destination(s)
3. **Query destination knowledge** — pull cached `Destination` records for the target region

Prompt assembly:

```
System: You are a travel planning assistant. Return only valid JSON matching ItinerarySchema.
        Weave in the following host experiences where contextually appropriate: [experiences]

User: [original message + parsed structured context]
```

Host experience injection is the key differentiator from generic AI travel tools.

### 9.4 Phase 3 — Streaming Generation

Stream the response — do not wait for full JSON before rendering. A 5–10 second blank screen kills the experience.

```
Claude streams JSON token by token
        ↓
Server parses chunks for completed day objects
        ↓
Pushes completed days to client via SSE as they arrive
        ↓
Client renders each day card incrementally
Globe pins appear as coordinates arrive
```

Each completed day object in the JSON stream becomes a discrete SSE push event.

### 9.5 Phase 4 — Persistence (async, after stream)

Once the full response lands:

1. Validate complete itinerary JSON against Zod schema
2. Upsert `Destination` records for any new locations
3. Create `Trip → ItineraryDay[] → ItineraryItem[]` in Postgres via `persistence.ts`
4. Trigger image resolution pipeline in background (non-blocking)
5. Return `tripId` to client → URL updates to `/trip/[id]`

Image loading is optimistic: show skeletons, populate as the fallback chain resolves.

### 9.6 Phase 5 — Globe Render (Client)

By the time persistence completes, the globe already has pins from streamed coordinates.

On `tripId` confirmed:
- Finalize pin states (replace optimistic with DB-backed IDs)
- Fly camera to encompass the full trip region
- Link day cards ↔ globe pins bidirectionally

### 9.7 Target Timeline (Happy Path)

| Time | Event |
|------|-------|
| 0ms | User submits prompt |
| 50ms | Server: parse input, fire parallel DB queries |
| 200ms | Server: prompt assembled, Claude API call initiated |
| 800ms | First day object streamed → Day 1 card + pin render |
| 1.5s | Day 2, Day 3 arrive |
| 2–4s | Full itinerary streamed |
| 4.1s | Validation + DB writes begin |
| 4.5s | `tripId` returned, URL updates to `/trip/[id]` |
| 4.5s+ | Image pipeline runs in background |

Perceived wait: ~4s. User sees content from 800ms — feels fast.

### 9.8 Failure Cases

| Failure | Handling |
|---------|----------|
| Claude returns malformed JSON | Retry once with stricter prompt; structured error if retry fails |
| No host experiences match destination | Generate normally — no empty state, just no host cards |
| Streaming drops mid-response | Show what rendered, offer "continue generating" |
| DB write fails post-generation | Keep itinerary in Redux state, retry write, never lose user content |
| Image pipeline exhausted | Render placeholder — never block itinerary display |

### 9.9 v1 vs v2 Decision

**v1:** Full-response approach with skeleton loader. Simpler to implement, good enough UX.
**v2:** Streaming partial JSON with SSE incremental rendering. Significantly better UX — swap in once the core loop is stable. The SSE infrastructure built for v2 also powers real-time itinerary updates.

---

_This document reflects the MVP system design. Post-MVP additions (WebSockets, social graph, CLIP embeddings) will require a revised architecture review._
