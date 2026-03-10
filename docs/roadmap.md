# Localhost Roadmap

## MVP

### 1. Host Suggestions in Itinerary Panel
**Goal:** Surface host experiences directly in the AI-generated itinerary alongside sights, so hosts are a first-class part of the trip — not an afterthought.

- When the AI generates or updates an itinerary, it should automatically drop in a relevant `EXPERIENCE` item for each day where a matching host exists nearby
- Host experience items should be visually distinct in the itinerary panel (e.g. orange accent, "Hosted" badge) vs regular sights
- The AI prompt should be updated to actively prioritise host experiences over generic POIs when a match is available
- Fallback: if no host match exists for a day's city, insert a placeholder card prompting the user to find a host

**Key files:** `globe-itinerary.tsx`, AI route handler, itinerary context

---

### 2. Host Experience Markers on the Globe
**Goal:** Show host stop locations as distinct markers on the planner globe, clearly differentiated from generic route markers.

- Host experience stops should render as markers on the Cesium globe during itinerary planning (currently only showing for confirmed anchors)
- Visual distinction from route markers:
  - Circular profile image billboard (like the host markers already used in the explore view)
  - Accent ring colour matching host status (draft = orange, booked = green)
  - Slightly larger on hover/selection
- On click: open the host panel or anchor booking flow
- Coordinate with the `AnchorMarkers` component and the `placeMarkers` / `routeMarkers` pipeline

**Key files:** `cesium-globe.tsx`, `anchor-markers.tsx`, `globe-itinerary.tsx`

---

### 3. Travel Add-ons: Flights, Accommodation, Car Rental
**Goal:** Let users complete their trip booking within Localhost by surfacing relevant travel options.

**Recommended approach: Affiliate APIs (phase 1)**
Affiliate integrations keep payment off our infrastructure and are faster to ship:
- **Flights:** Kayak Affiliate API or Skyscanner Partners API — deep-link to results with pre-filled origin/destination/dates from the itinerary
- **Accommodation:** Booking.com Affiliate Partner Programme — embed or deep-link with city + dates
- **Car Rental:** RentalCars.com Affiliate API — deep-link with pickup/dropoff locations from the itinerary

**Direct API approach (phase 2, post-traction)**
- **Amadeus for Developers** (free tier available) — flight search, hotel search, car rental search; payment stays with the provider
- **Sabre REST APIs** — more comprehensive GDS data but higher integration complexity and cost

**Globe/Itinerary integration:**
- Add a "Travel" section to the itinerary panel (between days or as a day-level footer)
- Show flight card for first/last day, accommodation card per city, optional car rental card
- These items should appear on the globe as distinct travel arc markers (flights = geodesic arc, accommodation = building icon marker)

**Key files:** `globe-itinerary.tsx`, `itinerary-day.tsx`, new `travel-addons` feature module

---

## Post-MVP

### 4. Manual Trip Creation (AI-Optional)
**Goal:** Open the platform to users who prefer to plan manually or want to refine AI output hands-on — broadening the addressable demographic significantly.

- Trip creation flow with a manual mode toggle ("Plan with AI" vs "Build it myself")
- Manual tools:
  - Add/remove/reorder days
  - Search for and add route markers directly (place search via Google Places or Mapbox)
  - Add anchors manually by browsing available hosts
  - Drag-and-drop reordering of items within and across days
- Passive AI mode: AI is available as a sidebar suggestion engine but doesn't auto-generate — it proposes, user accepts/rejects
- The chat widget becomes optional context rather than the primary input

**Key files:** `itinerary-builder.tsx`, `globe-itinerary.tsx`, `add-item-modal.tsx`, new manual creation flow

---

### 5. Profile Pages & Social Features
**Goal:** Make trips shareable and give users an identity on the platform, increasing retention and organic growth.

- **User profile pages:** Avatar, bio, home city, travel style tags, trip history
- **Shareable itineraries:** Public/private toggle per trip; shareable link generates a read-only view of the globe + itinerary panel
- **Social interactions:** Save/bookmark trips from other users, follow travellers, see where your network is going
- **Host profiles (enhanced):** Review system visible on host cards and the globe, response rate, upcoming availability

---

### 6. UI Polish & Animations
**Goal:** Elevate the product feel to match the ambition of the experience.

- Globe transitions: smooth camera fly-to when selecting a day or marker
- Itinerary panel: staggered card entrance animations, skeleton loaders during AI generation
- Chat widget: typing indicator, message entrance animations
- Drag-and-drop for itinerary items (within and across days) — full implementation
- Mobile-responsive layout for the globe + panel view
- Dark/light mode toggle with persistent preference
