# Analysis: Persistent "Remove from Day" CTA in Host Panel

## 1. Executive Summary
The "Remove from Day" button in the **Global Host Panel** remains active even for booked/paid experiences. This occurs because the component only tracks whether an experience is "present" in the itinerary, ignoring its booking status (Draft vs. Booked). This allows users to inadvertently remove paid bookings from their view without cancelling them.

## 2. Technical Root Cause

### 2.1 The Logic Chain
1.  **Data Source (`globe-itinerary.tsx`)**:
    - The `addedExperienceIds` set is derived from `selectedDestData.activities`.
    - It collects ALL experience IDs, regardless of whether their status is `DRAFT`, `PENDING`, or `BOOKED`.
    - *Code:*
      ```typescript
      // globe-itinerary.tsx:138
      const addedExperienceIds = useMemo(() => {
        // ... filters for presence, but NOT status
        return new Set(selectedDestData.activities.map(item => item.experienceId!));
      }, [selectedDestData]);
      ```

2.  **Component Rendering (`host-panel.tsx`)**:
    - The `HostPanel` receives `addedExperienceIds` as a prop.
    - Inside `HostCardWithExperiences`, it checks this set to decide button state.
    - *Code:*
      ```tsx
      // host-panel.tsx:190
      {isAdded ? 'Remove from Day' : ...}
      ```
    - Since valid bookings are "Added", the button resolves to "Remove from Day".

### 2.2 Missing Data Flow
- `HostPanel` has **no knowledge** of booking status. It only knows "is this ID in the list?".
- A separate prop (e.g., `bookedExperienceIds`) is required to distinguish safe-to-remove items from locked bookings.

## 3. Impact
- **Orphan Data**: Users can remove the UI card for a booking they paid for. The booking remains valid in the database/Stripe, but the user has no way to see or access it.
- **User Confusion**: "Removing" implies cancellation, but no cancellation logic runs.

## 4. Recommended Fix Strategy (Pending Implementation)
1.  **Update `globe-itinerary.tsx`**: Calculate a `bookedExperienceIds` set (ids where `status === 'BOOKED'`).
2.  **Update `HostPanel` Props**: Pass this new set to the component.
3.  **Update `HostPanel` UI**:
    - Check if `bookedExperienceIds.has(exp.id)`.
    - If True: Render "Booked" (Disabled) or "Manage" instead of "Remove from Day".
