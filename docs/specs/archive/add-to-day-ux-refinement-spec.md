# Implementation Spec — Add to Day UX Refinement

Date: 2026-02-03
Owner: Debugger
Status: Ready for Implementer

## 1. Scope

### In Scope
- **HostPanel Component**: Update the "Add to Day" button state logic to be disabled when no day is selected.
- **GlobeItinerary Component**: Refactor the experience addition flow to remove the intermediate `ProposalDialog` and the automatic chat message dispatch.
- **ExperienceDrawer Component**: Ensure the "Add" flow remains consistent with the new direct-add behavior (as it shares the handler).

### Excluded
- Changes to the underlying `addExperienceToTrip` thunk logic (API interactions remain the same).
- Changes to the `BookingDialog` or `PaymentModal` flows.
- Backend API changes.

## 2. Current State

- **Button Behavior**: In `HostPanel`, if no day is selected (`selectedDayNumber` is undefined), the button reads "Add to Trip" and is enabled. Clicking it triggers an `alert('Please select a day...')` in the parent component.
- **Messaging Flow**: Clicking "Add to Day" calls `handleAddExperience`, which opens `ProposalDialog`. The user must type a message and confirm.
- **Side Effects**: Upon confirmation, the app adds the experience to the store AND dispatches `sendChatMessage` to the P2P chat system, initiating a conversation automatically.

## 3. Desired Behavior

- **Button Constraints**: The "Add to Day" button in `HostPanel` (and `HostCardWithExperiences`) MUST be **disabled** (visually and functionally) if `selectedDayNumber` is not present. The text should remain "Add to Day" (or similar) but be grayed out.
- **Direct Action**: Clicking "Add to Day" should **immediately** trigger the `addExperienceToTrip` logic without opening any modal (`ProposalDialog`).
- **Silent Addition**: The action MUST NOT dispatch `sendChatMessage`. The experience is added to the itinerary, but no chat thread is initialized or messaged until the user explicitly chooses to message the host later (or confirms a booking).

## 4. Constraints (Non-Negotiable)

- **UX Consistency**: The removal of the message dialog applies to BOTH the Host Panel and the `ExperienceDrawer` (since they share `handleAddExperience`).
- **State Validity**: We must still perform the check for `tripId` and `selectedDestination` before dispatching the add action, even if the button is supposed to be disabled (defense in depth).
- **Files**:
    - Modify `src/components/features/host-panel.tsx`
    - Modify `src/components/features/globe-itinerary.tsx`
    - (Optional) Remove `proposal-dialog.tsx` usage.

## 5. Interfaces & Contracts

### `HostPanel` -> `HostCardWithExperiences`
- **Props**: `selectedDayNumber` (number | undefined).
- **Behavior**: If `selectedDayNumber` is falsey, `<button>` has `disabled={true}`.

### `GlobeItinerary`
- **Function**: `handleAddExperience(host, experience)`
- **Old Flow**: Checks duplicates -> Sets `pendingProposal` -> Renders Dialog.
- **New Flow**: Checks duplicates -> Calls `dispatch(addExperienceToTrip(...))` immediately.

## 6. Testing Requirements

### Unit/Component Tests
- **HostPanel**:
    - Render with `selectedDayNumber={undefined}` -> Verify button is disabled.
    - Render with `selectedDayNumber={1}` -> Verify button is enabled.
- **GlobeItinerary (Logic)**:
    - Verify `handleAddExperience` does not set any state that opens a dialog.
    - Verify `addExperienceToTrip` is dispatched.
    - Verify `sendChatMessage` is NOT dispatched.

### E2E Tests
1.  **Flow**: Open Host Panel (without selecting day) -> Verify "Add" buttons are disabled.
2.  **Flow**: Select a Day -> Buttons become enabled.
3.  **Flow**: Click "Add to Day" -> Item appears in Itinerary timeline immediately (no popup).
4.  **Flow**: Check Chat -> No new conversation created for that item.

## 7. Out-of-Scope

- "Undo" functionality for the direct add (users can just click "Remove").
- Optimistic UI updates beyond what Redux Toolkit already provides.
- Changing the "Remove from Day" behavior.
