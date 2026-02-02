# API Reference (Current)

Notes:
- All routes live under `src/app/api/**/route.ts`.
- Most routes require authentication; availability endpoints require host ownership.
- Endpoints marked **stubbed** return 501 and are not implemented.

## Auth
- `GET/POST /api/auth/[...nextauth]` — NextAuth handlers.

## Trips
- `GET /api/trips` — list current user trips.
- `POST /api/trips` — create trip.
- `GET /api/trips/:tripId` — trip with stops/days/items.
- `POST /api/trips/:tripId/plan` — replace entire plan.
- `POST /api/trips/:tripId/items` — add item.
- `DELETE /api/trips/:tripId/items/:itemId` — remove item.

## Host Draft + Publish
- `GET /api/host/draft`
- `POST /api/host/draft`
- `DELETE /api/host/draft`
- `POST /api/host/draft/generate` — AI draft generation.
- `POST /api/host/publish`
- `GET /api/host/experience`
- `PATCH /api/host/experience`

## Availability
- `GET /api/host/availability?experienceId=...` — host-only.
- `POST /api/host/availability` — host-only bulk create.
- `DELETE /api/host/availability` — host-only delete by id list.
- `GET /api/availability?experienceId=...&from=YYYY-MM-DD&to=YYYY-MM-DD` — public read.

## Booking + Messaging
- `POST /api/bookings` — **stubbed**
- `GET /api/bookings` — **stubbed**
- `GET /api/bookings/:bookingId/messages`
- `POST /api/bookings/:bookingId/messages`

## Chat
- `POST /api/chat` — AI router.
- `POST /api/chat/preliminary` — **stubbed**
- `GET /api/chat/:candidateId` — **stubbed**
- `GET/POST /api/chat/:candidateId/messages` — **stubbed**

## Itinerary Candidates
- `GET/POST /api/itinerary/candidates` — **stubbed**
- `GET/PUT/PATCH /api/itinerary/candidates/:id` — **stubbed**

## Orchestrator
- `POST /api/orchestrator` — start job.
- `GET /api/orchestrator?jobId=...` — poll job.

## Debug
- `GET /api/debug/accelerate`
