# Data Model Notes

This is a working summary of key Prisma models and the invariants they rely on.

## User
- `isHost`, `verificationTier`, `trustScore`.
- Host profile fields: `bio`, `quote`, `responseTime`.

## Experience
- Owned by `User` (host).
- Core fields: `category`, `duration`, `price`, `photos[]`.
- Availability lives in `ExperienceAvailability`.

## ExperienceAvailability
- `date` (host-local date) with optional `startTime` / `endTime`.
- `spotsLeft` optional for date-only availability.
- `timezone` optional (IANA string).

## Booking
- Links to `Experience` and `User` (guest).
- Optional `itemId` if attached to itinerary.
- Optional `startTime`, `endTime`, `timezone`.

## Trip / Itinerary
- `Trip` → `TripStop` → `ItineraryDay` → `ItineraryItem`.
- `ItineraryItem.type` is enum (`SIGHT`, `EXPERIENCE`, `MEAL`, `TRANSPORT`, `LODGING`, `FREE_TIME`, `NOTE`).

## Message
- Attached to a `Booking`.

## Invariants
- Availability is authoritative for booking flow.
- Trip plan writes are full replacements of stops/days/items.
- Booking creation should respect availability capacity and time slot.
