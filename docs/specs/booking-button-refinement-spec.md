# Specification: Booking Button Logic Refinement

## 1. Problem Statement
Users are seeing "Book" buttons on itinerary items that are not bookable. Specifically:
- Generic "Experience" items (e.g., "Eiffel Tower" from a Places search) show a Book button on hover.
- These items lack a `hostId`, so clicking "Book" triggers a validation error or fails silently (as seen in logs).
- "Meal" items also trigger this button if typed as such.

The current logic in `ItineraryDayColumn` (`src/components/features/itinerary-day.tsx`) is:
```typescript
const isAnchor = item.type === 'EXPERIENCE' || item.type === 'MEAL';
// ...
{onBookItem && isAnchor && ( <Button>Book</Button> )}
```

## 2. Proposed Solution
Restrict the "Book" button visibility to **only** items that are explicitly actionable as "Localhost Experiences".

### 2.1 Logic Update
The condition for showing the "Book" button should be:
1. `item.type === 'EXPERIENCE'` (Meals generally aren't "bookable" in the same flow unless they are hosted dinners).
2. `item.hostId` must be present (indicating it's linked to a Localhost provider).

Revised Logic:
```typescript
const isBookable = item.type === 'EXPERIENCE' && !!item.hostId;
```

### 2.2 Component Updates
- **`src/components/features/itinerary-day.tsx`**: Update the hover action condition.
- **`src/components/features/itinerary-item.tsx`**: Ensure the main body button (if reintroduced or persisting) follows the same logic. (Currently irrelevant as user reverted, but good for consistency).

## 3. Implementation Steps
1.  Open `src/components/features/itinerary-day.tsx`.
2.  Locate the hover action block (lines 133+).
3.  Change the condition `isAnchor` to `isAnchor && item.hostId`. 
    *   *Self-Correction*: `isAnchor` determines styling (border color etc.). We should keep `isAnchor` for styling, but create a separate check for the button.
    *   Let's use `isBookable = item.type === 'EXPERIENCE' && !!item.hostId`.
4.  Remove the button for `MEAL` types unless we decide hosted meals count as Experiences (usually they do, but they'd have `hostId`).

## 4. Verification
- Add a generic place (e.g., "Central Park") -> Hover -> **No Book Button**.
- Add a Localhost experience (from Host Panel) -> Hover -> **Book Button Visible**.
