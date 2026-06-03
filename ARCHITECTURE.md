# Architecture Overview

> **Key reference docs:**
> - [Product Requirements (PRD)](docs/PRD.md) — what we're building and why
> - [System Design](docs/system-design.md) — detailed technical design, data models, and service contracts

## System Shape

| Layer | Technology | Location |
|-------|-----------|----------|
| Frontend | Next.js 16 App Router + React 19 | `src/app/`, `src/components/` |
| State | Redux Toolkit | `src/store/` |
| Backend | Next.js API route handlers | `src/app/api/` |
| AI Engine | Vercel AI SDK + OpenAI/Anthropic | `src/lib/ai/` |
| Database | PostgreSQL + pgvector via Prisma | `prisma/schema.prisma` |
| Payments | Stripe Connect | `src/lib/stripe/` |
| Maps | Google Places + Google Routes + Cesium | `src/lib/maps/`, `cesium-globe.tsx` |

---

## Core Flows

### Trip Planning (Guest)
1. Chat widget sends user prompt to `/api/orchestrator`.
2. Orchestrator classifies intent (`CREATE_PLAN | MODIFY_PLAN | FIND_HOSTS | ADD_HOST | BOOK | GENERAL`).
3. LLM agent runs with tool calls: `search_localhosts`, `resolve_place`, `generate_route`, `check_availability`, `get_weather`.
4. Structured output (`ItineraryPlan`) validated by Zod schema.
5. `plan-converter.ts` converts plan → Redux `GlobeDestination[]` + `TravelRoute[]`.
6. UI renders via Cesium globe + itinerary sidebar.
7. Persistence: `/api/trips/[tripId]` PATCH → atomic DB write through `src/lib/trips/persistence.ts`.
8. Every write creates a `TripRevision` for audit + rollback.

### Host Experience Creation
1. Host edits draft at `/become-host/[draftId]`.
2. Draft auto-saved (debounced) via `PATCH /api/host/draft` → `ExperienceDraft`.
3. Publishing: `POST /api/host/publish` → creates `HostExperience` + copies `ExperienceStop[]`.
4. LLM generates title, description, and stop suggestions during draft phase.

### Availability (Host + Guest)
1. Host manages slots at `/experiences/:id/availability`.
2. Stored in `ExperienceAvailability` (date-only or date + time + timezone + spotsLeft).
3. Agent and guest flows read availability via `check_availability` tool + `/api/availability`.

### Booking + Messaging
1. Guest triggers booking: `POST /api/bookings` → status `TENTATIVE`.
2. Stripe `PaymentIntent` created; confirmation moves to `CONFIRMED`.
3. On confirmation: Stripe transfer to host's Connect account, chat thread unlocked.
4. Messages stored in `Message`, associated to `ChatThread` (one per booking).
5. Synthetic host bots auto-reply via `SyntheticReplyJob` queue with configurable latency + persona.

---

## Data Models

### Trip & Itinerary
```
Trip
  └─ TripAnchor (type: CITY | REGION | ROAD_TRIP | TRAIL)
       └─ ItineraryDay (dayIndex)
            └─ ItineraryItem (type: SIGHT | EXPERIENCE | MEAL | FREE_TIME | TRANSPORT | NOTE | LODGING)
                  └─ ItineraryItemImage[]
Trip
  └─ TripRevision[] (full audit trail, versioned)
```

### Experience Marketplace
```
Experience (embedding: vector 1536d, engagementScore)
  └─ ExperienceAvailability[]
  └─ Booking[]
  └─ Review[]

ExperienceDraft → (publish) → HostExperience
  └─ ExperienceStop[]
```

### Booking
```
Booking (TENTATIVE → CONFIRMED → COMPLETED/CANCELLED)
  ├─ stripePaymentId, stripeTransferId
  ├─ payoutStatus (NOT_ELIGIBLE → ELIGIBLE → RELEASED)
  └─ ChatThread
       └─ Message[]
```

### Activity Intelligence (RAG)
```
City (tier: 1|2|3, enrichmentScore, lastEnrichedAt)
Activity (embedding: vector 1536d, engagementScore, metadataJson)
PlaceCache → Place (fingerprint, providerAliases)
```

---

## State & Persistence

### Redux Slices
| Slice | Owns |
|-------|------|
| `globe` | destinations, routes, markers, tripId, selection state |
| `orchestrator` | jobId, status, plan, stage |
| `toolCalls` | AI tool call events + history |
| `hosts` | host list, selectedHostId, filter |
| `hostCreation` | draftId, stops, form state |
| `p2pChat` | threads, activeThreadId, messages |
| `profile` | current user |
| `ui` | sidebar, activeTab, notifications |

### Database Persistence
- Trips: `Trip` → `TripAnchor` → `ItineraryDay` → `ItineraryItem` (+ images)
- Availability: `ExperienceAvailability`
- Booking + messages: `Booking` + `ChatThread` + `Message`
- Orchestrator session: `OrchestratorSession` (allows resume across browser sessions)
- Orchestrator job: `OrchestratorJob` (status + result for polling)
- Rate limiting: `RateLimitEntry`
- API cost audit: `ExternalApiCall`

---

## AI System

### Orchestrator (`src/lib/ai/orchestrator.ts`)
- Classifies intent, selects inventory, runs LLM, validates output, hydrates plan.
- **Schemas**: `DraftItinerarySchema`, `ModificationDiffSchema`, `IntentSchema` (all Zod).
- **Tools**: five pure functions in `src/lib/ai/tools/`.
- **Validators**: `geo-validator`, `pacing-validator`, `corridor-validator`, `direction-validator`.

### Plan Conversion (`src/lib/ai/plan-converter.ts`)
- Converts `ItineraryPlan` → `GlobeDestination[]` + `TravelRoute[]`.
- IDs are **deterministic** (`day-${dayNumber}`) — stable across re-applies.
- Preserves image URLs and polylines when merging into existing globe state.

### Trip Session (`src/lib/ai/trip-session.ts`)
- In-memory session serialized to `OrchestratorSession` in DB.
- Tracks current plan, host markers, and conversation history.

---

## Key Interfaces

| Interface | File | Purpose |
|-----------|------|---------|
| `convertPlanToGlobeData` | `plan-converter.ts` | AI plan → globe state |
| `convertTripToGlobeDestinations` | `trip-converter.ts` | DB trip → globe state |
| `convertGlobeDestinationsToApiPayload` | `trip-converter.ts` | Globe → DB payload |
| `saveTripPlan` | `trips/persistence.ts` | Atomic trip write with versioning |
| `resolveHostMarkers` | `orchestrator.ts` | Build proximity-based host suggestions |

---

## API Route Ownership

| Route | Layer |
|-------|-------|
| `/api/orchestrator` | AI engine entry point (rate-limited: 10 req/min/IP) |
| `/api/trips/[tripId]` | Trip CRUD + itinerary persistence |
| `/api/host/draft`, `/api/host/publish` | Host creation flow |
| `/api/bookings` | Booking lifecycle |
| `/api/chat`, `/api/chat/threads` | Messaging |
| `/api/webhooks/stripe` | Stripe event handling |
| `/api/planner/experiences` | Experience search for planner |
| `/api/images/places` | Image search (Google, Unsplash, Pexels) |
| `/api/routes/compute` | Google Routes polyline pre-computation |
| `/api/availability` | Experience availability queries |
| `/api/synthetic-bots/process` | Synthetic reply job processor |

---

## External Services

| Service | Purpose | Client |
|---------|---------|--------|
| OpenAI / Anthropic | LLM generation | `@ai-sdk/openai`, `@ai-sdk/anthropic` |
| Google Places API | Geocoding, place details, photos | `src/lib/maps/` |
| Google Routes API | Routing + polylines | `src/lib/maps/` |
| Stripe | Payments + Connect payouts | `src/lib/stripe/` |
| Unsplash / Pexels | Stock images | `src/lib/images/` |
| pgvector | Semantic search over activities | `prisma/schema.prisma` |
| NextAuth.js | Auth (OAuth + email) | `src/app/(auth)/` |

---

## Background / Async Work

- **Orchestrator jobs**: `POST /api/orchestrator` returns a `jobId`; UI polls until complete.
- **Synthetic bot replies**: `SyntheticReplyJob` table queued on message send; `POST /api/synthetic-bots/process` processes them (configurable 5–30s delay).
- **Activity enrichment**: `src/lib/activity-enrichment.ts` fetches Google Places for city inventory; run on-demand before strict-mode planning.
- No persistent background worker — all async work is job-table + polling.
