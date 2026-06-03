# Feature Planning

Backlog of features under consideration. Each section can be broken out into a separate ticket once scoped and prioritized.

---

## 1. Pre-generation intake: travel group & accommodation style

**Goal:** Collect key trip preferences before the AI generates an itinerary, rather than having the AI guess.

**Context:** `GenerateItineraryInputSchema` already has slots for `partyType`, `partySize`, `budget`, `pace`, and `lodgingArea`. The AI already asks the right questions conversationally — the gap is that answers are not captured in a structured way, and `generateItinerary` has no gate preventing it from being called before enough context is collected.

**Proposed approach:**

The AI collects preferences conversationally. A preferences JSON is maintained per trip (persisted to DB, re-injected into the system prompt on every turn). Each field has one of three states:

```
null       → not yet collected
"waived"   → user opted out / said "don't care" / said "just go ahead"
<value>    → actual answer e.g. "couple", "hotel_in_town"
```

**Gate rule:** `generateItinerary` can only be invoked when no field is `null`. Every field must be either answered or `"waived"`.

**New tool — `updateTripPreferences`:** The AI calls this whenever it learns or infers an answer, including waivers:
```json
{ "field": "accommodationStyle", "value": "waived" }
{ "field": "partyType", "value": "couple" }
```

**Waiver triggers (AI interprets these):**
- Explicit opt-out: "I don't care about accommodation" → waive that field
- "Just go ahead" / "generate it" → AI waives all remaining `null` fields, then calls `generateItinerary`
- Repeated steering away from a soft field → AI waives and moves on

**Required fields (cannot be waived):** destination, dates, partyType, partySize

**Optional fields (can be waived, defaults used):** accommodationStyle, pace, budget, foodPreferences

**Fields to collect:**
- `partyType`: solo | couple | family_with_kids | family_with_elderly | group
- `partySize`: number
- `accommodationStyle`: hotel_in_town | house_outside_town | campsite | hostel | mixed *(affects lodging suggestions, routing, and daily structure — worth capturing but defaults to mixed if waived)*
- `pace`: relaxed | balanced | packed
- `budget`: budget | mid | premium

**Files likely involved:**
- `src/lib/agents/planner-generate.ts` — add `updateTripPreferences` tool, gate logic
- `src/lib/agents/planner-prompts.ts` — instructions on when to waive, field priority order
- `prisma/schema.prisma` — store preferences JSON on Trip
- API layer — re-inject persisted preferences into system prompt on each turn

---

## 2. Manual itinerary editing (non-AI driven)

**Goal:** Let users add, remove, and reorder itinerary items without triggering AI.

**Context:** `POST /api/trips/[tripId]/items` and `addFiller()` / `removeFiller()` exist in context, but UI affordances are missing.

**Proposed approach:**
- "Add item" button per day in the sidebar
- Simple inline form: title, type (SIGHT / MEAL / FREE_TIME / TRANSPORT / NOTE / LODGING), optional time and note
- Delete with confirmation on existing items
- Drag-and-drop reorder using `orderIndex` that already exists in the DB
- Add a `source` field (enum: `AI | USER`) to `ItineraryItem` rather than relying on the existing `createdByAI` boolean — more descriptive and leaves room for future sources (e.g. `IMPORT`, `TEMPLATE`)

**Files likely involved:**
- `src/components/features/itinerary-sidebar.tsx`
- `src/components/features/itinerary-item.tsx`
- `src/app/api/trips/[tripId]/items/route.ts`
- `prisma/schema.prisma` — add `source` enum field to `ItineraryItem`

---

## 3. User-added locations + AI route building

**Goal:** Let users add known locations (by name or pin) to an itinerary day and have the AI build routes incorporating them.

**Context:** Cesium globe supports markers with coordinates. Travel mode already exists as `transportPreference` in the generation schema.

**Proposed approach:**

**Primary — location search bar:**
- Search bar that calls the Google Places API by name
- Returns place details: name, coordinates, place type, address
- User confirms the result and assigns it to a day
- Google Places `types` field is used to make an educated guess at item classification:
  - City / locality / administrative area → candidate for a new `TripAnchor` (city-level stop)
  - POI, attraction, museum, restaurant, park, etc. → `ItineraryItem` (activity)
  - Ambiguous types prompt the user to choose: "Add as a new stop" vs "Add as an activity on Day X"
- Note: Google Places determinism is imperfect — the classification above is a best-effort heuristic, not guaranteed. Edge cases (e.g. a neighborhood, a region) may need a manual override.

**Secondary — pin drop (optional, lower priority):**
- Click on the globe → reverse geocode to get place name + type
- Same classification logic as search bar applies

**Shared follow-up — AI route building:**
- User-added locations feed into `mustSee` constraints
- "Build route" action passes selected waypoints + travel mode to the planner
- Visual distinction between user-added and AI-placed markers (tied to `source: USER` field from #2)
- Travel mode selector: drive | walk | train | flight | boat

**Files likely involved:**
- `src/components/features/cesium-globe.tsx` — optional pin drop handler
- `src/lib/agents/planner-generate.ts` — pass waypoints as `mustSee`
- `src/components/features/anchor-markers.tsx`
- New search bar component + Google Places API integration

---

## 4. Deduplicate activities across the entire trip

**Goal:** Ensure the same activity never appears more than once across any day in a trip. Same host across multiple days is fine as long as the activities are different.

**Context:** The AI can suggest the same `experienceId` on multiple days within a `TripAnchor`. The deduplication unit is the activity, not the host.

**Proposed approach:**
- Update the planner system prompt: "each activity (`experienceId`) must appear at most once across the entire trip — the same host may appear multiple times if offering different activities"
- Add deduplication logic in the `generateItinerary` tool: maintain a set of `experienceId` values already used across all days and all anchors; reject duplicates before writing
- Scope is trip-wide, not just per-city

**Files likely involved:**
- `src/lib/agents/planner-prompts.ts`
- `src/lib/agents/planner-generate.ts` (or wherever `generateItinerary` tool logic lives)

---

## 5. Unique images per city-day

**Goal:** Always show a unique image for each day spent in the same city, even if a user stays for 5+ days.

**Context:** Image lookup is keyed at the city level, so all days in a city share the same pool and likely always pick the same image.

**Proposed approach:**
- Maintain a per-city assigned image set during itinerary construction — track which image URLs have already been used for a given city in this trip
- When selecting an image for a day, pick one not yet in the assigned set
- If the current pool is exhausted (all images already used), fetch additional city images from the image source and expand the pool
- This ensures uniqueness scales to however many days are spent in a city, without capping at pool size

**Open question:** Where images are sourced from needs to be audited — the fetch/expand step depends on whether images come from a third-party API (easy to request more) or a fixed DB set (may need a seeding strategy).

**Files likely involved:**
- `src/lib/api/trip-converter.ts`
- Wherever `ItineraryItemImage` records are created/fetched
- Image source/provider layer (to be identified during implementation)

---

## 6. Accommodation links / external booking

**Goal:** Give users a path to book accommodation from within the itinerary, without building a full booking integration.

**Context:** A `LODGING` item type exists but has no booking action. No schema changes are needed for a first version.

**Options (in order of effort):**

### Option A — Quick (no schema change)
When a `LODGING` item is tapped, show a modal with pre-filled deep links:
- Booking.com: `booking.com/search?ss={city}&checkin={date}&checkout={nextDate}&group_adults={partySize}`
- Airbnb: similar pattern
- Opens in new tab

### Option B — Better UX
- Add a `bookingUrl` field to `ItineraryItem`
- Let the AI suggest a search URL, or let the user paste one
- Render a "View options →" button on the lodging card

### Option C — Future
- Affiliate API integration (Booking.com / Expedia)

**Recommendation:** Ship Option A first, plan Option B as a follow-up.

**Files likely involved:**
- `src/components/features/itinerary-item.tsx` — lodging card rendering
- `src/components/features/itinerary-sidebar.tsx`
- `prisma/schema.prisma` — only if pursuing Option B+
