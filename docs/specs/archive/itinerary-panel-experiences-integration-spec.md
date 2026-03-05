# Technical Specification - Integrate Host Panel into Itinerary Panel (Experiences Tab)

## 1. Scope

### In Scope
- Integrate the existing Host Panel into the existing left Itinerary Panel via tabs.
- Add an "Experiences" tab alongside "Itinerary".
- Add day-selection pills inside the Experiences tab.
- Rename Host Panel copy from "Local Hosts" to "Experiences" when embedded in the panel.
- Remove the standalone right-side Host Panel.

### Explicitly Out of Scope
- Booking, availability, payments, or monetization changes.
- AI plan generation, orchestration, or tool behavior changes.
- Data model or API changes.
- Marker rendering or map visualization changes.
- Redesigning the ExperienceDrawer.

## 2. Current State (Relevant Behavior)
- The Itinerary Panel is rendered on the left in `src/components/features/globe-itinerary.tsx`.
- The Host Panel is rendered on the right in `src/components/features/globe-itinerary.tsx`, using `HostPanel`.
- Day selection uses `selectedDestination` and `handleDaySelect` in `globe-itinerary.tsx`.
- `HostPanel` has fixed sidebar layout styles (`w-96`, `border-l`) in `src/components/features/host-panel.tsx`.
- `HostPanel` header copy reads "Local Hosts".

## 3. Desired Behavior

### 3.1 Tabs in Itinerary Panel
- The Itinerary Panel must include a tab bar with two tabs:
  - `Itinerary`
  - `Experiences`
- Default tab is `Itinerary`.
- Tabs are visible only when the panel is expanded (not collapsed).

### 3.2 Experiences Tab Content
- The Experiences tab renders the Host Panel content inside the left panel.
- The standalone right-side Host Panel is removed entirely.
- The Host Panel header and empty state copy must display "Experiences".
- The Host Panel must use a full-width layout when embedded (no right-side border).

### 3.3 Day Pills in Experiences Tab
- A horizontal row of day pills appears above the Host Panel list.
- One pill per destination, ordered by day number.
- Pill label: `Day {dayNumber}` (no city name required).
- Clicking a pill must call the existing `handleDaySelect(day.id)`.
- Selected day pill must be visually distinct (active state).
- If there are no destinations, day pills are hidden.

### 3.4 Selection and CTA Behavior
- The Experiences tab must use the existing selected day (`selectedDestination`) for state.
- The Host Panel CTA text must continue to show `Add to Day {N}` when a day is selected and `Add to Trip` otherwise (no change to logic).

## 4. Constraints (Non-Negotiable)
- Do not change data sources or filtering logic for hosts:
  - Continue to use existing `nearbyHosts` / `hostMarkers` derived in `globe-itinerary.tsx`.
- Do not change map selection logic:
  - `handleDaySelect` remains the single source of truth for day selection.
- Do not change `ExperienceDrawer` behavior or props.
- Do not introduce new API calls or DB schema changes.

## 5. Interfaces and Contracts

### 5.1 HostPanel Layout Variant
Add an optional `variant` prop to control layout:

```
type HostPanelVariant = 'sidebar' | 'panel';

interface HostPanelProps {
  variant?: HostPanelVariant; // default: 'sidebar'
  hosts: HostMarkerData[];
  selectedHostId?: string | null;
  selectedDayNumber?: number;
  addedExperienceIds?: Set<string>;
  bookedExperienceIds?: Set<string>;
  onHostClick: (host: HostMarkerData) => void;
  onViewProfile: (host: HostMarkerData) => void;
  onAddExperience: (host: Host, experience: HostExperience) => void;
}
```

#### Variant Behavior
- `sidebar` (default): existing styles (`w-96`, right-side border).
- `panel`: full-width, no right-side border, no fixed width.

### 5.2 Itinerary Panel Tab State
- Use local state inside `globe-itinerary.tsx` unless otherwise specified.
- Only two valid tab values: `ITINERARY` and `EXPERIENCES`.

## 6. File-Level Requirements

### Must Modify
- `src/components/features/globe-itinerary.tsx`
  - Add tab bar.
  - Render Itinerary or Experiences content based on tab.
  - Remove right-side Host Panel render.
  - Add day pills row in Experiences tab.
- `src/components/features/host-panel.tsx`
  - Add `variant` prop.
  - Change header and empty state copy for panel variant.

### Must NOT Modify
- `src/lib/ai/*`
- `src/lib/api/*`
- `prisma/*`
- `src/components/features/experience-drawer.tsx`

## 7. Testing Requirements

### Unit Tests
- If tab state is added to Redux in the future, update `src/store/ui-slice.test.ts`.
- If local state only, no new unit test required.

### Playwright E2E
Add or update tests to confirm:
- The Experiences tab is visible and selectable.
- Clicking a day pill updates CTA text to "Add to Day N".
- Switching back to Itinerary shows the existing day list.

## 8. Acceptance Criteria (Pass/Fail)
- The right-side Host Panel no longer renders.
- The left panel includes `Itinerary` and `Experiences` tabs.
- Experiences tab renders the Host Panel content inside the left panel.
- Day pills appear in Experiences tab and change selected day on click.
- Host Panel header shows "Experiences" in embedded view.
- No API or schema changes are introduced.

## 9. Known Limitations
- Experiences tab relies on existing destinations. If destinations are empty, no day pills appear and the Host Panel empty state is shown.

## 10. Implementation Plan (Checklist)
1. Add tab state and tab UI in `globe-itinerary.tsx`.
2. Move Host Panel render into the Experiences tab.
3. Add day pills row above the Host Panel list.
4. Add `variant` prop and adjust Host Panel layout and copy.
5. Remove the standalone right-side Host Panel render block.
6. Update or add Playwright coverage.
