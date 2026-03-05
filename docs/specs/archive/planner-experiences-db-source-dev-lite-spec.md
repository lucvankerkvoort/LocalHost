# Technical Specification - Planner Experiences from DB (Dev-Lite Seed)

## 1) Problem Statement
The planner itinerary panel currently lists host experiences from static in-repo mock data (`src/lib/data/hosts.ts`). This prevents the planner from reflecting experiences created by real users through the become-host flow, and the globe host markers are not derived from database experiences. We need planner experiences and globe markers to be sourced from the database so the itinerary panel reflects other users’ experiences and supports the full booking + chat loop in a dev-lite environment with seeded bookings and initial host messages.

## 2) Scope

### In Scope
- Replace the planner experiences data source with DB-backed experiences and host users.
- Derive globe host markers from the same DB-backed experiences used in the planner.
- Filter planner experiences by **same city as the selected destination**.
- Keep experiences as **suggestions** (not auto-added to the itinerary).
- Ensure dev-lite seed data includes bookable experiences, seeded bookings, and initial host messages.

### Out of Scope
- Any changes to booking/payment lifecycle or Stripe integration.
- AI itinerary generation changes or orchestrator logic changes.
- Matching experiences to itinerary items (no geo matching or cross-referencing logic).
- Redesigning the Experiences UI or ExperienceDrawer.
- Changing global architecture patterns or replacing Redux.

## 3) Current State (Contract to Preserve)
- Planner experiences list uses `HOSTS` from `src/lib/data/hosts.ts`.
- `src/components/features/host-panel.tsx` looks up full host data from `HOSTS` by marker ID.
- Globe host markers (`globe.hostMarkers`) are currently set using static host data and proximity filtering.
- `src/components/features/globe-itinerary.tsx` derives `nearbyHosts` from `hosts-slice` and `filterHostsByProximity`.
- Booking and chat are gated by booking status (`CONFIRMED` or `COMPLETED`).
- Redux is the single source of truth for globe state and trip session state.

## 4) Desired Behavior

### 4.1 Planner Experiences Source
- Planner experiences MUST be derived from database `Experience` records joined with their `User` host.
- Do not query or depend on `HostExperience` for planner data in this scope.
- Experiences shown must satisfy all conditions:
  - `Experience.isActive = true`.
  - `User.isHost = true`.
  - `Experience.city` matches the selected destination city (see 4.2).
- Do not read `src/lib/data/hosts.ts` for planner experiences.

### 4.2 City Filter (Strict Match)
- City matching is exact after normalization:
  - `normalizeCity = city.trim().toLowerCase()`.
  - Match `normalizeCity(Experience.city) === normalizeCity(selectedDestinationCity)`.
- `selectedDestinationCity` resolution order:
  - `selectedDestination.city` if present.
  - Otherwise `selectedDestination.name`.
- No fuzzy matching, no radius-based matching, no country-based fallback.

### 4.3 Globe Host Markers
- Globe host markers MUST be derived from the **same dataset** as the planner experiences list.
- If a host has multiple experiences in the selected city, the globe shows **one marker per host**.
- Marker coordinates MUST be set from:
  - `Experience.latitude`/`Experience.longitude` if present (prefer the first experience for that host in the city).
  - Otherwise use `getCityCoordinates(Experience.city)`.
- Experiences that cannot resolve coordinates are excluded from both the list and markers.

### 4.4 Planner UX Behavior
- Experiences are **available suggestions** only. They are not auto-added to a day or trip.
- The “Add to Day” / “Add to Trip” CTA behavior remains unchanged and continues to use Redux thunks.
- The Experiences tab list and globe markers remain in sync as the selected destination changes.
- `hosts-slice` and `src/lib/data/hosts.ts` may remain in use for non-planner surfaces only. Planner surfaces must not depend on them.

## 5) Data Contracts

### 5.1 API Response (New or Updated)
A single API entry point must return planner experiences for a city.

Endpoint contract:
- Method: `GET`
- Path: `/api/planner/experiences`
- Query: `city=<string>` (required)
- Auth: required. If unauthenticated return `401`.
- If `city` missing or blank return `400`.
- Response must include `hosts: []` even when no matches.
- Hosts are grouped by `User.id` and include only that host’s experiences in the requested city.
- Sorting:
  - Hosts sorted by average experience rating (desc), then host name (asc).
  - Experiences sorted by rating (desc), then price (asc).

Response shape:
```json
{
  "city": "Rome",
  "hosts": [
    {
      "id": "host-id",
      "name": "Maria Rossi",
      "photo": "https://...",
      "bio": "...",
      "quote": "...",
      "responseTime": "within an hour",
      "languages": ["Italian", "English"],
      "interests": ["cooking"],
      "city": "Rome",
      "country": "Italy",
      "marker": {
        "lat": 41.9028,
        "lng": 12.4964
      },
      "experiences": [
        {
          "id": "exp-id",
          "title": "...",
          "description": "...",
          "category": "FOOD_DRINK",
          "duration": 180,
          "price": 7500,
          "rating": 4.9,
          "reviewCount": 127,
          "photos": ["https://..."],
          "city": "Rome",
          "country": "Italy"
        }
      ]
    }
  ]
}
```
Mapping rules:
- `PlannerExperience.title` = `Experience.title`.
- `PlannerExperience.description` = `Experience.description`.
- `PlannerExperience.category` = `Experience.category`.
- `PlannerExperience.duration` = `Experience.duration`.
- `PlannerExperience.price` = `Experience.price`.
- `PlannerExperience.rating` = `Experience.rating`.
- `PlannerExperience.reviewCount` = `Experience.reviewCount`.
- `PlannerExperience.photos` = `Experience.photos`.
- `PlannerExperience.city` = `Experience.city`.
- `PlannerExperience.country` = `Experience.country`.
- `PlannerExperienceHost.photo` = `User.image`.
- `PlannerExperienceHost.bio` = `User.bio`.
- `PlannerExperienceHost.quote` = `User.quote`.
- `PlannerExperienceHost.responseTime` = `User.responseTime`.

### 5.2 Redux State (Planner)
Planner experiences must live in Redux and be derived only through thunks.

State location:
- Add `plannerHosts` to `globe-slice`.
- Add `plannerHostsStatus` in `globe-slice` with values: `idle | loading | ready | error`.

State shape (example):
```ts
type PlannerExperienceHost = {
  id: string;
  name: string;
  photo?: string | null;
  bio?: string | null;
  quote?: string | null;
  responseTime?: string | null;
  languages: string[];
  interests: string[];
  city?: string | null;
  country?: string | null;
  marker: { lat: number; lng: number };
  experiences: PlannerExperience[];
};

type PlannerExperience = {
  id: string;
  title: string;
  description: string;
  category: string;
  duration: number;
  price: number;
  rating: number;
  reviewCount: number;
  photos: string[];
  city: string;
  country: string;
};
```

### 5.3 HostPanel Data Contract
`HostPanel` must render using DB-backed data and must not import `HOSTS`.

Required props (shape only):
```ts
interface HostPanelProps {
  hosts: PlannerExperienceHost[];
  hostMarkers: HostMarkerData[];
  onHostClick: (marker: HostMarkerData) => void;
  onViewProfile: (marker: HostMarkerData) => void;
  onAddExperience: (host: PlannerExperienceHost, experience: PlannerExperience, marker: HostMarkerData) => void;
  onFocusExperience?: (host: PlannerExperienceHost, experience: PlannerExperience, marker: HostMarkerData) => void;
}
```
Behavior requirements:
- For each rendered host, derive its marker from `hostMarkers` where `marker.hostId === host.id` or `marker.id === host.id`.
- If no marker is found, synthesize a marker from `host.marker` and `host` fields.

## 6) State & Data Flow
- `fetchPlannerExperiencesByCity(city)` is the only entry point for loading planner experiences.
- The thunk must:
  - Fetch the API response for the selected city.
  - Store the host list in `globe.plannerHosts` and set `plannerHostsStatus`.
  - Derive and dispatch `setHostMarkers(...)` in `globe-slice` from the same host list.
  - Use `HostMarkerData` with fields:
    - `id = host.id`
    - `hostId = host.id`
    - `name = host.name`
    - `lat/lng = host.marker`
    - `photo = host.photo`
    - `headline = host.quote`
    - `rating = average rating of host.experiences` (rounded to 1 decimal)
    - `experienceCount = host.experiences.length`
- Components must **not** write to the DB directly for planner state.
- `globe-itinerary.tsx` must dispatch `fetchPlannerExperiencesByCity(selectedDestinationCity)` whenever `selectedDestination` changes.
- If no destination is selected, set `plannerHosts = []`, `plannerHostsStatus = idle`, and `hostMarkers = []`.
- If the API request fails, set `plannerHostsStatus = error` and clear `hostMarkers`.

## 7) Dev-Lite Seed Requirements
The dev-lite seed must provide a full experience loop using DB data.

### 7.1 Seed Profile
- `SYNTHETIC_BOTS_PROFILE=dev-lite` is the required profile.
- Dev-lite must continue to seed **bookings and initial host messages**.

### 7.2 Minimum Seed Guarantees (Dev-Lite)
- Synthetic hosts: `>= 30`.
- Experiences: `>= 90`.
- Availability days per experience: `>= 30`.
- Bookings: `>= 180`.
- Messages per booking: `>= 2` with **at least one host message**.
- At least `1` confirmed booking per 10 experiences (rounded down).

### 7.3 Required Booking/Chat Fields
For each seeded booking with status `CONFIRMED` or `COMPLETED`:
- `chatUnlocked = true`.
- `paymentStatus = PAID`.
- At least one message exists with `senderId = hostId`.

### 7.4 Experience Location Fields
- Seeded `Experience` records must have usable map coordinates.
- Populate `Experience.latitude` and `Experience.longitude` from `getCityCoordinates(Experience.city)` when possible.
- Experiences missing coordinates are excluded from planner and markers.

## 8) Constraints & Invariants (Non-Negotiable)
- Planner experiences must not rely on `src/lib/data/hosts.ts`.
- Globe host markers must be derived from planner experiences, not from static host data or proximity filtering.
- No DB writes from React components for planner/globe/trip session state.
- Booking status flow and chat gating must not change.
- No AI-generated activities are inserted into the planner experiences list.
- Do not repurpose or remove `hosts-slice`; non-planner surfaces may continue to use it.

## 9) File-Level Requirements

### Must Modify or Add
- API route to fetch planner experiences by city.
- Redux thunk for fetching planner experiences.
- Redux state to store planner experiences in `globe-slice`.
- `src/components/features/globe-itinerary.tsx` to load planner experiences and use Redux state.
- `src/components/features/globe-itinerary.tsx` must remove `hosts-slice` and `filterHostsByProximity` usage for planner experiences.
- `src/components/features/host-panel.tsx` to consume DB-backed host data (no static lookups).
- `prisma/seed.ts` to ensure dev-lite requirements in Section 7.

### Must Not Modify
- `src/lib/ai/*`
- Stripe webhook logic and payment handling
- `ExperienceDrawer` behavior (it is not part of the planner panel flow today)

## 10) Test Requirements (Definition of Correctness)

### Unit
- City normalization and filtering logic.
- Redux reducer behavior for planner experiences state.
- Host marker derivation from planner experiences.

### Integration
- API returns only experiences for the requested city.
- Experiences missing coordinates are excluded.

### Playwright
- Planner Experiences tab shows DB-backed hosts for a seeded city.
- Switching destination updates the experiences list and markers.
- “Add to Day N” uses existing flow and persists via Redux thunk.

## 11) Acceptance Criteria (Pass/Fail)
- The planner Experiences tab never reads from `src/lib/data/hosts.ts`.
- For a destination city with seeded experiences, the list shows at least one host and one experience from the DB.
- Host markers on the globe match the hosts shown in the planner list.
- Experiences are suggestions only and are not auto-added to the itinerary.
- Dev-lite seed produces bookings with at least one host message per confirmed/completed booking.
- All required tests pass.
- `GET /api/planner/experiences?city=<city>` returns only experiences whose `Experience.city` matches `<city>` by normalization.

## 12) Implementation Plan (Checklist)
1. Define API response contract for planner experiences by city.
2. Add Redux thunk + state for planner experiences.
3. Update globe itinerary to load planner experiences on destination change.
4. Update host panel to render DB-backed hosts/experiences.
5. Update dev-lite seed to satisfy Section 7.
6. Add unit, integration, and Playwright coverage.
