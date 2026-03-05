# Technical Spec — Trips Workspace Flow (General -> Planner)

Date: 2026-02-03
Owner: Architect
Status: Ready for Implementer

## 1. Scope

### In Scope
- Flow for creating and entering new Trip workspaces.
- General persona operational responsibilities before navigation.
- Planner persona responsibilities after route entry.

### Excluded
- Booking/payment actions in Trips globe.
- Cross-session memory.

## 2. Flow Contract

### Create New Trip
1. User is outside workspace routes.
2. General persona interprets trip intent.
3. System executes `createNewTrip(initialData)` using structured intent.
4. Route changes to `/trips/{tripId}` before globe-driven planning begins.
5. Chat resets.
6. Planner persona activates from route.
7. Planner receives trip snapshot and speaks first.

## 3. Persona Responsibility Boundaries

### General Persona (Outside `/trips/{id}`)
Allowed:
- intent interpretation
- operational creation/update calls
- navigation to canonical route

Forbidden:
- deep itinerary generation
- globe-specific actions without navigation
- irreversible commits

### Planner Persona (Inside `/trips/{id}`)
Allowed:
- itinerary draft generation
- day/theme/route refinement
- schema-driven follow-up questions

Forbidden:
- booking/payment/publish actions
- navigation away from globe as side-effect

## 4. State Rules

- Trip creation must produce real persisted workspace before Planner acts.
- Planner mutates visible state only.
- All planner mutations must be reflected in UI state and persisted state.

## 5. UX Rules

- Navigation is confirmation for reversible operations.
- Toast/snackbar confirms successful operation.
- Deletion operations require confirmation dialog.

## 6. Constraints

- Planner cannot use transcript memory from pre-navigation General chat.
- Route `/trips/{tripId}` is sole source for Planner activation.

## 7. Acceptance Criteria (Binary)

1. New trip creation always results in real `tripId` and route `/trips/{tripId}`.
2. Planner always activates on `/trips/{tripId}`.
3. Chat resets on trip route entry and on trip ID switch.
4. Planner first message is snapshot-driven and appears automatically.
5. No Planner references to previous non-trip chat context.

## 8. Testing Requirements

### Unit
- trip intent -> create payload mapping.
- persona selector route mapping for trips.
- trip snapshot builder (known/missing fields).

### E2E
- dashboard input -> create trip -> route transition -> planner first message.
- trip A -> trip B switch resets chat and replans from B snapshot.
- deletion flow requires confirmation dialog.
