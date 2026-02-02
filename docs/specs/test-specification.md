# LocalHost Test Specification

> **Document Purpose**: This specification defines all required tests for the LocalHost codebase. It captures current behavior as-is, without suggesting refactors unless required for testability.

---

## Table of Contents

1. [Unit Test Specifications](#1-unit-test-specifications)
   - [State Management (Redux)](#11-state-management-redux)
   - [AI Orchestration](#12-ai-orchestration)
   - [Data Transformers & Converters](#13-data-transformers--converters)
   - [Utility Functions](#14-utility-functions)
   - [Stripe Integration](#15-stripe-integration)
   - [Agent Constraints](#16-agent-constraints)
   - [Semantic Search](#17-semantic-search)
   - [Type Helpers](#18-type-helpers)
2. [Integration Test Specifications](#2-integration-test-specifications)
3. [Playwright E2E Test Specifications](#3-playwright-e2e-test-specifications)

---

## 1. Unit Test Specifications

---

### 1.1 State Management (Redux)

#### 1.1.1 `src/store/globe-slice.ts`

**Responsibility**: Manages globe visualization state including destinations, routes, markers, and itinerary data.

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `setTripId` sets tripId | Happy | `"trip-123"` | `state.tripId === "trip-123"` | None |
| `setVisualTarget` sets coordinates | Happy | `{ lat: 35.6762, lng: 139.6503 }` | state contains matching coordinates | None |
| `clearVisualTarget` resets to null | Happy | - | `state.visualTarget === null` | None |
| `setDestinations` replaces destinations array | Happy | Array of 3 `GlobeDestination` | `state.destinations.length === 3` | None |
| `setDestinations` normalizes duplicate ids | Edge | Destinations with duplicate IDs | Later duplicates are removed | None |
| `addHostMarkers` appends without duplicates | Happy | 2 new markers | Markers appended, existing preserved | None |
| `addHostMarkers` skips existing marker IDs | Edge | Marker with existing ID | Not duplicated | None |
| `addPlaceMarker` respects MAX_PLACE_DISTANCE_METERS | Edge | Marker > 300km from existing | Added | None |
| `addPlaceMarker` skips nearby duplicates | Edge | Marker < threshold from existing | Skipped | None |
| `clearItinerary` resets all itinerary fields | Happy | - | destinations, routes, markers all empty | None |
| `setItineraryFromPlan` applies plan via `applyPlan` | Happy | Valid `ItineraryPlan` | Destinations/routes populated | None |
| `hydrateGlobeState` merges partial state | Happy | Partial state object | Only provided fields updated | None |
| `addLocalExperience` adds to correct day | Happy | `{ dayNumber: 2, item: {...} }` | Item added to day 2's activities | None |
| `addLocalExperience` creates day if missing | Edge | dayNumber not in destinations | New destination created | None |
| `updateDayIds` maps dayNumbers to IDs | Happy | `{ 1: "day-abc" }` | Day 1 gets id "day-abc" | None |
| `setHoveredItemId`/`setActiveItemId`/`setFocusedItemId` | Happy | String ID | Respective state field updated | None |
| `extraReducers` handles `toolCallReceived` | Happy | Tool call with navigation | Updates markers appropriately | None |

---

#### 1.1.2 `src/store/hosts-slice.ts`

**Responsibility**: Manages host data with geolocation and proximity filtering.

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `initializeHostsWithLocations` maps hosts to coordinates | Happy | HOSTS array | All hosts have lat/lng | Mock `getCityCoordinates` |
| `initializeHostsWithLocations` filters invalid coordinates | Edge | Host with unknown city | Host excluded from result | Mock returns null |
| `setHosts` replaces entire hosts array | Happy | New host array | `state.allHosts` replaced | None |
| `addHost` appends new host | Happy | New host | Host appended | None |
| `addHost` skips duplicate ID | Edge | Host with existing ID | Not duplicated | None |
| `removeHost` filters by ID | Happy | Valid host ID | Host removed | None |
| `getDistanceKm` Haversine calculation | Happy | Two known coordinates | Returns expected km | None |
| `getDistanceKm` same point | Edge | Identical coordinates | Returns 0 | None |
| `makeSelectHostsNearLocation` filters by radius | Happy | lat/lng, 50km radius | Only hosts within 50km | None |
| `makeSelectHostsNearLocation` with (0,0) | Edge | lat=0, lng=0 | Returns empty array | None |
| `filterHostsByProximity` sorts by distance | Happy | Multiple hosts | Sorted ascending by distance | None |

---

#### 1.1.3 `src/store/host-creation-slice.ts`

**Responsibility**: Manages host experience creation workflow state.

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `setCity` sets city and coordinates | Happy | `{ name, lat, lng }` | All three fields set | None |
| `addStop` appends stop | Happy | Valid stop | Stop added to array | None |
| `removeStop` filters by ID | Happy | Stop ID | Stop removed | None |
| `updateStop` merges changes | Happy | `{ id, changes }` | Stop updated | None |
| `reorderStop` moves up | Happy | `{ id, direction: 'up' }` | Stop moved up, orders renumbered | None |
| `reorderStop` at boundary | Edge | First stop, direction 'up' | No change | None |
| `moveStop` repositions between IDs | Happy | activeId, overId | Stop relocated, orders updated | None |
| `updateDraft` merges partial state | Happy | Partial state | State merged | None |
| `setDraft` replaces with merged initial | Happy | New draft | State replaced | None |
| `resetDraft` returns to initial | Happy | - | State equals initialState | None |

---

#### 1.1.4 `src/store/orchestrator-slice.ts`

**Responsibility**: Tracks orchestrator job lifecycle (draft → running → complete/error).

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `jobStarted` creates job entry | Happy | `{ id, stage, message }` | Job created with 'draft' status | None |
| `jobStarted` sets activeJobId | Happy | - | `state.activeJobId` equals job id | None |
| `jobProgress` updates existing job | Happy | `{ id, stage, message }` | Job status='running', fields updated | None |
| `jobProgress` with missing job | Edge | Unknown job ID | No change | None |
| `jobCompleted` sets complete status | Happy | `{ id }` | Job status='complete', activeJobId=null | None |
| `jobFailed` sets error state | Failure | `{ id, error }` | Job status='error', error message stored | None |
| `clearJobs` resets all | Happy | - | Empty jobs, null activeJobId | None |

---

#### 1.1.5 `src/store/p2p-chat-slice.ts`

**Responsibility**: Manages P2P chat threads, messages, and async operations.

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `initThread` creates new thread | Happy | Thread init data | Thread created, activeBookingId set | None |
| `initThread` skips if exists | Edge | Existing bookingId | Thread not replaced | None |
| `setActiveBookingId` updates active | Happy | Booking ID | State updated | None |
| `receiveMessage` adds HOST message | Happy | `{ bookingId, content }` | Message added, unread incremented | None |
| `receiveMessage` missing thread | Edge | Unknown bookingId | No change | None |
| `markThreadAsRead` resets unread | Happy | Booking ID | unreadCount=0, HOST messages marked read | None |
| `selectAllThreads` sorts by lastMessageAt | Happy | Multiple threads | Sorted descending | None |
| `selectActiveThread` returns correct thread | Happy | Active booking set | Returns matching thread | None |
| `selectTotalUnreadCount` sums unread | Happy | Multiple threads with unread | Correct total | None |
| `fetchMessages.fulfilled` populates messages | Happy | API response | Thread messages updated | Mock fetch |
| `sendChatMessage.fulfilled` appends message | Happy | API response | Message appended | Mock fetch |

---

#### 1.1.6 `src/store/tool-calls-slice.ts`

**Responsibility**: Tracks AI tool call events for UI updates.

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `toolCallReceived` adds to history | Happy | Tool call event | Event in history | None |
| Event structure validated | Edge | Malformed event | Gracefully handled | None |

---

#### 1.1.7 `src/store/ui-slice.ts`

**Responsibility**: General UI state management.

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| All reducers update state correctly | Happy | Various actions | UI state updated | None |

---

### 1.2 AI Orchestration

#### 1.2.1 `src/lib/ai/orchestrator.ts`

**Responsibility**: Orchestrates multi-step AI itinerary creation with intent classification and tool execution.

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `RateLimiter.schedule` enforces 1.1s interval | Happy | Multiple rapid calls | Calls spaced by minInterval | Mock timers |
| `calculateDistanceMeters` accurate for known points | Happy | Tokyo to Kyoto coords | ~370km | None |
| `getDistanceToAnchor` with null anchor | Edge | null anchor | Returns null | None |
| `getDistanceToAnchor` with valid candidate | Happy | Candidate with coords | Calculated distance | None |
| `buildSeededOffset` generates deterministic offset | Happy | Same seed | Same offset | None |
| `jitterPoint` applies offset to point | Happy | Base point, seed | Jittered point | None |
| `classifyIntent` returns CREATE_PLAN for new trip | Happy | "Plan a trip to Paris" | `{ intent: 'CREATE_PLAN' }` | Mock AI SDK |
| `classifyIntent` returns MODIFY_PLAN with context | Happy | "Add another day", session | `{ intent: 'MODIFY_PLAN' }` | Mock AI SDK |
| `classifyIntent` returns FIND_HOSTS | Happy | "Find hosts nearby" | `{ intent: 'FIND_HOSTS' }` | Mock AI SDK |
| `classifyIntent` extracts location | Happy | "Trip to Tokyo" | extractedLocation.city = 'Tokyo' | Mock AI SDK |
| `handleMessage` routes to correct handler | Happy | Various intents | Correct handler called | Mock handlers |
| `handleAddHost` matches host from list | Happy | "Add the food tour host" | Host added to plan | Mock AI SDK |
| `handleAddHost` no match found | Edge | Unrecognizable host name | Error response | Mock AI SDK |
| `handleBook` confirms tentative booking | Happy | "Book the tour" | Booking confirmed | Mock AI SDK |
| `findBestMatchingHost` fuzzy matches | Happy | Partial name match | Returns best match | Mock AI SDK |
| `planTrip` generates full plan | Happy | Valid prompt | Complete ItineraryPlan | Mock all tools |
| `planTripFromDraft` hydrates draft | Happy | Draft itinerary | Geocoded plan | Mock geocoding |
| Callbacks fire during orchestration | Happy | Orchestrate with callbacks | All callbacks invoked | None |

---

#### 1.2.2 `src/lib/ai/tools/tool-registry.ts`

**Responsibility**: Central registry for AI-callable tools with validation and execution.

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `register` adds tool | Happy | Valid ToolDefinition | Tool in registry | None |
| `register` warns on overwrite | Edge | Existing tool name | Console warning, tool replaced | None |
| `listTools` returns all tool info | Happy | Multiple tools registered | Array of ToolInfo | None |
| `hasTool` returns true for existing | Happy | Registered tool name | true | None |
| `hasTool` returns false for missing | Edge | Unknown name | false | None |
| `getTool` returns definition | Happy | Registered name | ToolDefinition | None |
| `execute` validates params | Happy | Valid params | Handler called | Mock handler |
| `execute` rejects invalid params | Failure | Invalid params | `{ success: false, code: 'INVALID_PARAMS' }` | None |
| `execute` handles missing tool | Failure | Unknown tool name | `{ success: false, code: 'TOOL_NOT_FOUND' }` | None |
| `execute` catches handler errors | Failure | Handler throws | `{ success: false, code: 'EXECUTION_ERROR' }` | Mock throws |
| `toAISDKTools` converts format | Happy | Multiple tools | Object with description/parameters | None |

---

#### 1.2.3 Individual Tools (`src/lib/ai/tools/`)

**Files**: `check-availability.ts`, `generate-route.ts`, `get-weather.ts`, `resolve-place.ts`, `search-localhosts.ts`

| File | Test Cases |
|------|------------|
| `check-availability.ts` | Returns availability for valid experience; handles missing experience; date range filtering |
| `generate-route.ts` | Generates walking route; handles invalid coordinates; respects mode parameter |
| `get-weather.ts` | Returns weather for coordinates; handles API errors; caches results |
| `resolve-place.ts` | Geocodes place name; handles ambiguous names; returns confidence score |
| `search-localhosts.ts` | Filters hosts by location; respects limit; handles no results |

---

### 1.3 Data Transformers & Converters

#### 1.3.1 `src/lib/ai/plan-converter.ts`

**Responsibility**: Converts AI orchestrator output to globe visualization types.

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `convertPlanToGlobeData` extracts destinations | Happy | Plan with 3 days | 3 GlobeDestinations | None |
| `convertPlanToGlobeData` generates routes | Happy | Plan with navigation | TravelRoutes between activities | None |
| `convertPlanToGlobeData` handles missing locations | Edge | Activity with null location | Skipped gracefully | None |
| `isValidCoordinate` rejects (0,0) | Edge | lat=0, lng=0 | false | None |
| `isValidCoordinate` rejects out-of-range | Edge | lat=200 | false | None |
| `addRouteMarker` creates start/end markers | Happy | Route data | RouteMarkerData created | None |
| `extractCityName` parses city from address | Happy | Address with city | City name extracted | None |
| `mapTransportMode` converts walk → walking | Happy | 'walk' | 'walk' | None |
| `mapTransportMode` converts transit → train | Happy | 'transit' | 'train' | None |
| `generateMarkersFromDestinations` recreates markers | Happy | Restored destinations | Markers regenerated | None |
| `getCenterPoint` calculates center | Happy | Multiple destinations | Center coordinates | None |
| `getCenterPoint` with empty array | Edge | [] | null | None |

---

#### 1.3.2 `src/lib/api/trip-converter.ts`

**Responsibility**: Converts between API trip format and globe destinations.

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `convertTripToGlobeDestinations` maps stops | Happy | Trip with stops/days | GlobeDestinations | None |
| `convertTripToGlobeDestinations` sorts by day | Happy | Unsorted days | Sorted by dayIndex | None |
| `convertTripToGlobeDestinations` assigns colors | Happy | 3-day trip | Each day has unique color | None |
| `convertTripToGlobeDestinations` handles empty | Edge | Trip with no stops | [] | None |
| `convertGlobeDestinationsToApiPayload` groups by city | Happy | Multi-city destinations | Stops grouped | None |
| `mapItemType` defaults to SIGHT | Edge | undefined type | 'SIGHT' | None |
| `convertGlobeDestinationsToApiPayload` preserves order | Happy | Ordered destinations | Order preserved in payload | None |

---

### 1.4 Utility Functions

#### 1.4.1 `src/lib/utils.ts`

**Responsibility**: General utility functions for formatting and data manipulation.

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `cn` joins class names | Happy | 'foo', 'bar' | 'foo bar' | None |
| `cn` filters falsy values | Edge | 'foo', false, 'bar' | 'foo bar' | None |
| `formatPrice` formats cents to currency | Happy | 15000, 'USD' | '$150.00' | None |
| `formatPrice` handles 0 cents | Edge | 0 | '$0.00' | None |
| `formatPrice` different currency | Happy | 10000, 'EUR' | '€100.00' | None |
| `formatDuration` under 60 min | Happy | 45 | '45 min' | None |
| `formatDuration` exactly 60 min | Edge | 60 | '1h' | None |
| `formatDuration` with remainder | Happy | 90 | '1h 30min' | None |
| `formatDate` formats correctly | Happy | Date object | 'Mon, Jan 1' format | None |
| `formatDate` handles string input | Happy | ISO string | Formatted date | None |
| `formatRelativeTime` just now | Happy | Current time | 'just now' | None |
| `formatRelativeTime` minutes ago | Happy | 5 min ago | '5m ago' | None |
| `formatRelativeTime` hours ago | Happy | 3 hrs ago | '3h ago' | None |
| `formatRelativeTime` days ago | Happy | 2 days ago | '2d ago' | None |
| `formatRelativeTime` over a week | Edge | 10 days ago | Formatted date | None |
| `truncate` within limit | Edge | 'short', 100 | 'short' | None |
| `truncate` over limit | Happy | 'very long text...', 10 | 'very lo...' | None |
| `generateId` unique each call | Happy | Two calls | Different IDs | None |
| `debounce` delays execution | Happy | Rapid calls | Last call executes after delay | Mock timers |
| `debounce` cancels previous | Happy | Call, then call again before delay | Only last executes | Mock timers |
| `calculateAverageRating` calculates correctly | Happy | [4, 5, 3] | 4.0 | None |
| `calculateAverageRating` empty array | Edge | [] | 0 | None |
| `calculateAverageRating` rounds to 1 decimal | Happy | [4.33, 4.33, 4.34] | 4.3 | None |
| `formatGroupSize` same min/max singular | Happy | 1, 1 | '1 person' | None |
| `formatGroupSize` same min/max plural | Happy | 2, 2 | '2 people' | None |
| `formatGroupSize` range | Happy | 2, 6 | '2-6 people' | None |

---

#### 1.4.2 `src/types/globe.ts` (Helpers)

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `generateId` returns unique string | Happy | - | Unique ID format | None |
| `getColorForDay` day 1 | Happy | 1 | DAY_COLORS[0] | None |
| `getColorForDay` wraps around | Edge | 9 | DAY_COLORS[0] (cycle) | None |

---

#### 1.4.3 `src/types/itinerary.ts` (Helpers)

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `generateId` unique format | Happy | - | Timestamp-based ID | None |
| `createDaysFromRange` correct count | Happy | 3-day range | 3 ItineraryDay objects | None |
| `createDaysFromRange` same day | Edge | Same start/end | 1 day | None |
| `createDaysFromRange` assigns dayNumbers | Happy | 5-day range | dayNumbers 1-5 | None |
| `createDaysFromRange` formats dates | Happy | Range | ISO date strings | None |
| `createItinerary` creates complete object | Happy | All params | Full Itinerary | None |
| `createItinerary` sets timestamps | Happy | - | createdAt and updatedAt set | None |
| `createItem` creates with defaults | Happy | type, title, position | ItineraryItem with ID | None |
| `createItem` applies options | Happy | With options | Options merged | None |

---

### 1.5 Stripe Integration

#### 1.5.1 `src/lib/stripe/payments.ts`

**Responsibility**: Creates Stripe Payment Intents for bookings.

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `createBookingPayment` creates intent | Happy | Valid bookingId | `{ clientSecret, amount, currency }` | Mock Stripe, Prisma |
| Booking not found | Failure | Invalid bookingId | Throws 'Booking not found' | Mock Prisma returns null |
| Booking not owned by user | Failure | Wrong userId | Throws 'Booking does not belong' | Mock Prisma |
| Booking not TENTATIVE | Failure | CONFIRMED status | Throws 'not in TENTATIVE status' | Mock Prisma |
| Host not onboarded | Failure | No stripeConnectedAccountId | Throws 'Host not onboarded' | Mock Prisma |
| Host charges not enabled | Failure | chargesEnabled=false | Throws 'not fully onboarded' | Mock Prisma |
| Invalid amount | Failure | amountSubtotal=0 | Throws 'Invalid booking amount' | Mock Prisma |
| Platform fee calculated correctly | Happy | $150 booking | $15 fee (10%) | Mock all |
| Updates booking with fees | Happy | Valid booking | Prisma update called with fees | Mock all |
| PaymentIntent has correct metadata | Happy | Valid booking | metadata includes bookingId, hostId, guestId | Mock Stripe |

---

#### 1.5.2 `src/lib/stripe/connect.ts`

**Responsibility**: Manages Stripe Connect account creation and status.

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `createConnectAccount` creates new account | Happy | Valid userId | Stripe account ID | Mock Stripe, Prisma |
| `createConnectAccount` returns existing | Edge | User with account | Existing account ID returned | Mock Prisma |
| `createConnectAccount` user not found | Failure | Invalid userId | Throws 'User not found' | Mock Prisma null |
| `createAccountLink` generates URL | Happy | Account ID, origin | Onboarding URL | Mock Stripe |
| `updateAccountStatus` sets COMPLETE | Happy | Fully onboarded account | status='COMPLETE' | Mock Stripe |
| `updateAccountStatus` sets PENDING | Edge | payouts/charges disabled | status='PENDING' | Mock Stripe |
| `updateAccountStatus` sets RESTRICTED | Edge | disabled_reason set | status='RESTRICTED' | Mock Stripe |
| Updates user in database | Happy | Valid account | Prisma update called | Mock all |

---

#### 1.5.3 `src/lib/stripe/payouts.ts`

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| Payout creation for eligible booking | Happy | Eligible booking | Transfer created | Mock Stripe |
| Payout blocked for ineligible | Failure | NOT_ELIGIBLE status | Error thrown | Mock Prisma |

---

### 1.6 Agent Constraints

#### 1.6.1 `src/lib/agent-constraints/parser.ts`

**Responsibility**: Parses markdown spec files into structured agent/skill definitions.

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `parseMarkdownSpecs` extracts sections | Happy | Valid markdown | Object with spec names | None |
| `parseMarkdownSpecs` handles list values | Happy | Markdown with bullet lists | Arrays for list keys | None |
| `parseMarkdownSpecs` handles string values | Happy | Key-value pairs | String values | None |
| `parseMarkdownSpecs` ignores comments | Edge | Markdown with # comments | Comments not in output | None |
| `loadAgentSpecs` reads AGENTS.md | Happy | Valid file | AgentSpec record | Mock fs |
| `loadAgentSpecs` fills defaults | Edge | Missing optional fields | Defaults applied | Mock fs |
| `loadSkillSpecs` reads SKILLS.md | Happy | Valid file | SkillSpec record | Mock fs |
| File not found handling | Failure | Missing file | Error thrown | Mock fs throws |

---

#### 1.6.2 `src/lib/agent-constraints/runtime.ts`

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| Validates action against allowed_actions | Happy | Allowed action | Passes | None |
| Rejects forbidden action | Failure | Forbidden action | Rejected | None |
| Validates required inputs | Happy | All inputs provided | Passes | None |
| Rejects missing required input | Failure | Missing input | Rejected | None |

---

### 1.7 Semantic Search

#### 1.7.1 `src/lib/semantic-search.ts`

**Responsibility**: Semantic scoring and filtering of hosts/experiences.

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `scoreHost` matches categories | Happy | Host with matching category | High score, match reason | None |
| `scoreHost` matches interests | Happy | Host with matching interest | Score increased | None |
| `scoreHost` location filter | Happy | Intent with location | Only hosts in location | None |
| `scoreHost` no matches | Edge | No overlapping criteria | Score = 0 | None |
| `scoreExperience` scoring logic | Happy | Experience with matches | Score and reasons | None |
| `semanticSearchHosts` returns top N | Happy | limit=5 | Max 5 results | None |
| `semanticSearchHosts` filters by location | Happy | Location in intent | Only matching city | None |
| `semanticSearchHosts` handles empty | Edge | No matching hosts | [] | None |
| `semanticSearchExperiences` similar tests | Happy | Various inputs | Correct results | None |
| `getAllCategories` returns all | Happy | - | All category keys | None |

---

### 1.8 Type Helpers

#### 1.8.1 `src/lib/ai/types.ts` (Zod Schemas)

| Test Case | Type | Input | Expected Output | Mocking |
|-----------|------|-------|-----------------|---------|
| `GeoPointSchema` validates | Happy | `{ lat: 35.6, lng: 139.6 }` | Passes | None |
| `GeoPointSchema` rejects strings | Failure | `{ lat: "35.6" }` | Fails | None |
| `PlaceSchema` validates complete | Happy | Full place object | Passes | None |
| `PlaceSchema` with optionals | Happy | Minimal place | Passes | None |
| `ItineraryPlanSchema` validates | Happy | Complete plan | Passes | None |
| All schemas reject invalid data | Failure | Various invalid inputs | Zod errors | None |

---

## 2. Integration Test Specifications

Integration tests are required where unit tests are insufficient due to module interdependencies.

---

### 2.1 Globe State + Plan Converter Integration

**Modules Involved**: `globe-slice.ts`, `plan-converter.ts`

**Interaction Validated**: Converting an orchestrator plan and applying it to globe state produces valid, renderable globe data.

**Why Integration Required**: The `applyPlan` function calls `convertPlanToGlobeData` internally; testing the entire flow ensures data integrity.

| Test Case | Input | Expected Outcome |
|-----------|-------|------------------|
| Full plan to globe state | Complete ItineraryPlan | State has correct destinations, routes, markers |
| Plan with geocoding failures | Plan with null locations | Gracefully handles missing coords |

---

### 2.2 Orchestrator + Tool Registry Integration

**Modules Involved**: `orchestrator.ts`, `tool-registry.ts`, individual tools

**Interaction Validated**: Orchestrator correctly invokes tools via registry during plan generation.

**Why Integration Required**: Tool execution involves validation, handler invocation, and result processing across modules.

| Test Case | Input | Expected Outcome |
|-----------|-------|------------------|
| Orchestrator uses resolve-place | Plan request | Places geocoded via tool |
| Tool failure handled | Tool returns error | Orchestrator handles gracefully |

---

### 2.3 API Route + Prisma Integration

**Modules Involved**: API routes (`/api/bookings`, `/api/trips`, etc.), Prisma client

**Interaction Validated**: API routes correctly read/write database via Prisma.

**Why Integration Required**: Routes contain business logic tightly coupled to database operations.

| Test Case | Input | Expected Outcome |
|-----------|-------|------------------|
| POST /api/bookings creates record | Valid booking data | Booking in database |
| GET /api/trips returns user's trips | Authenticated request | User's trips returned |
| POST /api/trips validates user exists | Session with invalid user | 401 response |

> **Note**: Use Prisma test client with in-memory/test database.

---

### 2.4 Stripe Payment Flow Integration

**Modules Involved**: `payments.ts`, `connect.ts`, Prisma, Stripe API

**Interaction Validated**: Full payment flow from intent creation to booking update.

**Why Integration Required**: Multiple systems (Stripe, database) must coordinate.

| Test Case | Input | Expected Outcome |
|-----------|-------|------------------|
| Payment intent created | Valid booking | Intent created, booking updated |
| Webhook updates status | Stripe webhook payload | PaymentStatus updated |

> **Note**: Use Stripe test mode and mock webhook signatures.

---

## 3. Playwright E2E Test Specifications

E2E tests validate complete user flows through the browser.

---

### 3.1 App Load and Authentication

#### Test: Unauthenticated User Can Load App

- **Persona**: Anonymous visitor
- **Starting State**: No session
- **Actions**:
  1. Navigate to `/`
  2. Wait for page load
- **Expected Outcomes**:
  - Globe component renders
  - Auth button visible
- **Critical Assertions**:
  - No console errors
  - Page loads within 5s

---

#### Test: User Can Sign In with OAuth

- **Persona**: New user
- **Starting State**: Unauthenticated
- **Actions**:
  1. Click "Sign In" button
  2. Select OAuth provider (mock)
  3. Complete OAuth flow (mock callback)
- **Expected Outcomes**:
  - User redirected to app
  - User menu shows name
  - Session persisted
- **Critical Assertions**:
  - `session.user.id` exists

---

### 3.2 Trip Creation and Itinerary Hydration

#### Test: Authenticated User Can Create Trip

- **Persona**: Logged-in user
- **Starting State**: Authenticated, no trips
- **Actions**:
  1. Navigate to globe
  2. Open chat widget
  3. Type "Plan a 3-day trip to Paris"
  4. Wait for orchestrator completion
- **Expected Outcomes**:
  - Globe shows Paris destinations
  - Itinerary panel shows 3 days
  - Days have activities
- **Critical Assertions**:
  - `destinations.length >= 3`
  - Each destination has activities
  - Routes connect destinations

---

#### Test: Existing Trip Loads on Page Refresh

- **Persona**: Logged-in user
- **Starting State**: Authenticated, has existing trip
- **Actions**:
  1. Navigate to `/` with existing tripId
  2. Wait for hydration
- **Expected Outcomes**:
  - Globe shows saved destinations
  - Itinerary panel populated
- **Critical Assertions**:
  - Data matches database

---

### 3.3 Itinerary Editing and Persistence

#### Test: User Can Add Experience to Day

- **Persona**: Logged-in user
- **Starting State**: Trip with at least 1 day
- **Actions**:
  1. Click on day in itinerary
  2. Click "Add Experience" button
  3. Select experience from modal
  4. Confirm addition
- **Expected Outcomes**:
  - Experience appears in day
  - Experience card shows details
- **Critical Assertions**:
  - Item persisted to database
  - Page refresh shows item

---

#### Test: User Can Remove Item from Day

- **Persona**: Logged-in user
- **Starting State**: Day with items
- **Actions**:
  1. Hover over item
  2. Click remove/delete button
  3. Confirm deletion
- **Expected Outcomes**:
  - Item removed from UI
  - Other items reorder
- **Critical Assertions**:
  - Item removed from database

---

### 3.4 Persona Switching and Context Carryover

#### Test: User Can Switch Between Guest and Host Views

- **Persona**: User who is also a host
- **Starting State**: Logged in as guest
- **Actions**:
  1. Navigate to host dashboard
  2. View host experience
  3. Navigate back to guest view
- **Expected Outcomes**:
  - Host dashboard shows experience
  - Guest view shows trip
- **Critical Assertions**:
  - Session maintains both contexts

---

### 3.5 Booking Flow

#### Test: Guest Can Book Experience (Happy Path)

- **Persona**: Logged-in guest
- **Starting State**: Itinerary with tentative experience
- **Actions**:
  1. Click "Book Now" on experience
  2. Fill payment form (test card)
  3. Submit payment
  4. Wait for confirmation
- **Expected Outcomes**:
  - Payment processes
  - Booking status changes to CONFIRMED
  - Confirmation shown
- **Critical Assertions**:
  - `booking.status === 'CONFIRMED'`
  - `booking.paymentStatus === 'PAID'`

---

#### Test: Booking Fails with Invalid Card

- **Persona**: Logged-in guest
- **Starting State**: Itinerary with tentative experience
- **Actions**:
  1. Click "Book Now"
  2. Enter declined test card
  3. Submit
- **Expected Outcomes**:
  - Error message shown
  - Booking remains TENTATIVE
- **Critical Assertions**:
  - `booking.paymentStatus === 'FAILED'`

---

### 3.6 Messaging

#### Test: Guest Can Message Host

- **Persona**: Logged-in guest with booking
- **Starting State**: TENTATIVE booking exists
- **Actions**:
  1. Open chat panel
  2. Select booking thread
  3. Type message
  4. Send
- **Expected Outcomes**:
  - Message appears in thread
  - Message persisted
- **Critical Assertions**:
  - Message in database

---

### 3.7 Error Handling

#### Test: Graceful Handling of Network Error

- **Persona**: Any user
- **Starting State**: Loaded app
- **Actions**:
  1. Simulate network failure
  2. Attempt action (e.g., create trip)
- **Expected Outcomes**:
  - Error toast/message shown
  - App doesn't crash
  - Retry possible
- **Critical Assertions**:
  - No unhandled exceptions

---

#### Test: Partial State Recovery

- **Persona**: Logged-in user
- **Starting State**: Mid-flow (e.g., orchestrator running)
- **Actions**:
  1. Refresh page
- **Expected Outcomes**:
  - Saved state restored
  - No data loss
- **Critical Assertions**:
  - User can continue flow

---

### 3.8 Host Experience Creation

#### Test: Host Can Create and Publish Experience

- **Persona**: Logged-in host
- **Starting State**: User is host, no experience
- **Actions**:
  1. Navigate to "Become a Host" or host dashboard
  2. Set city
  3. Add stops
  4. Generate description (AI)
  5. Review and publish
- **Expected Outcomes**:
  - Experience created
  - Status = PUBLISHED
  - Appears in marketplace
- **Critical Assertions**:
  - Experience in database
  - Searchable by guests

---

## Appendix: Test Configuration Notes

### Mocking Strategy

- **AI SDK**: Mock `generateObject` and related functions
- **Stripe**: Use Stripe test mode with test API keys
- **Prisma**: Use test database or Prisma mock
- **Fetch**: Mock external API calls (Nominatim, weather)

### Test Database

- Use separate test database with migrations applied
- Seed with minimal test data
- Clean between test runs

### Environment Variables

```env
DATABASE_URL=postgresql://test:test@localhost:5432/localhost_test
STRIPE_SECRET_KEY=sk_test_...
OPENAI_API_KEY=test_key
```

### Playwright Configuration

```typescript
// playwright.config.ts
export default {
  testDir: './e2e',
  timeout: 30000,
  retries: 2,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
};
```
