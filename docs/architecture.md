# Architecture Overview

## System Shape
- **Frontend**: Next.js App Router + React, Redux Toolkit for shared state.
- **Backend**: Next.js route handlers (`src/app/api/**`) with Prisma.
- **AI**: Agent router + tools (orchestrator, search, availability).
- **Data**: PostgreSQL via Prisma schema.

## Core Flows

### Trip Planning (Guest)
1) Chat widget sends user prompt to the agent router.
2) Planner agent triggers `generateItinerary` tool (orchestrator job).
3) Orchestrator returns a plan; UI converts plan → globe state.
4) Plan is persisted to DB: `/api/trips/:tripId/plan`.
5) Switching trips fetches from DB and hydrates globe state.

### Host Creation (Host)
1) Host edits draft in `/become-host/[draftId]`.
2) Draft is auto-saved (debounced) to `experienceDraft`.
3) Publishing creates `hostExperience` and copies stops.

### Availability (Host + Guest)
1) Host manages availability via `/experiences/:id/availability`.
2) Availability is stored in `experienceAvailability` with optional time slots.
3) Agent and guest flows read availability via API/DB.

### Booking + Messaging
1) Booking created (tentative → confirmed).
2) Messages are attached to `bookingId`.

## State & Persistence
- **Redux**:
  - `globe` slice: destinations, routes, markers, tripId.
  - `toolCalls` + `orchestrator`: AI tool results and job status.
- **Persistence**:
  - Trips + itinerary: `Trip` → `TripStop` → `ItineraryDay` → `ItineraryItem`.
  - Availability: `ExperienceAvailability`.
  - Booking + messages: `Booking` + `Message`.

## Key Interfaces
- `convertPlanToGlobeData` (AI plan → globe)
- `convertTripToGlobeDestinations` (DB trip → globe)
- `convertGlobeDestinationsToApiPayload` (globe → DB payload)

## Background/Async Work
- Orchestrator jobs: `/api/orchestrator` + polling in UI.
- No background worker yet; long-running work is via jobs + polling.
