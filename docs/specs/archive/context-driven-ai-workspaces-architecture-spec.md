# Technical Spec — Context-Driven AI Workspaces: Architecture Contract

Date: 2026-02-03
Owner: Architect
Status: Ready for Implementer

## 1. Scope

### In Scope
- Canonical workspace routing for Trips and Experiences.
- Route-driven persona activation model.
- Chat reset and agent bootstrap rules on context switches.
- Shared constraints for all workspace agents.

### Excluded
- Long-term memory or preference learning.
- Behavioral profiling or personalization.
- Public experience route redesign.

## 2. Canonical Routes and Workspace Identity

### Required Routes
- Trips workspace: `/trips/{tripId}`
- Experiences workspace (owner-only, draft-first): `/experiences/{id}`

### ID Semantics
- In Experiences workspace, `{id}` is the draft identifier until publish.
- Public read-only published experience routes remain unchanged (out of scope).

## 3. Persona Activation Contract (Route-Only)

- Persona selection MUST be derived from route only.
- No globe-readiness gating is allowed for persona activation.
- Activation mapping:
  - Outside workspace routes -> General persona
  - `/trips/{tripId}` -> Planner persona
  - `/experiences/{id}` -> Host/Accountant persona

## 4. Context Reset and Bootstrap Rules

- Chat session MUST reset when either condition occurs:
  1. Persona change, or
  2. Workspace ID change within the same persona.
- On each reset, the active persona MUST emit the first assistant message based on state snapshot.
- Agents MUST bootstrap from structured snapshot only (not transcript).

## 5. Non-Negotiable Invariants

1. Conversation is ephemeral intent input, not source of truth.
2. DB + UI store is source of truth.
3. AI never invents workspaces; AI only enters existing workspace IDs.
4. No cross-context transcript references are allowed.
5. No invisible state mutation: user must see route/state change and feedback.

## 6. Shared UX Confirmation Rules

- Reversible operations may execute without blocking dialogs.
- Reversible operations MUST show toast/snackbar confirmation.
- Deletions REQUIRE explicit confirmation dialog for all entities in scope.
- Irreversible actions (publish, payment/booking confirmation) require explicit user action.

## 7. Constraints

- Do not change public published experience routes in this epic.
- Do not introduce long-term memory storage for persona behavior.
- Telemetry/logging is allowed for observability but MUST NOT be used as agent memory.

## 8. Acceptance Criteria (Binary)

1. Entering `/trips/{tripId}` always activates Planner persona.
2. Entering `/experiences/{id}` always activates Host/Accountant persona.
3. Chat resets on persona or workspace switch.
4. First assistant message appears after each workspace entry/reset.
5. No agent references previous-context conversations.

## 9. Out-of-Scope

- Persistent user memory and preference learning.
- Model-level personalization.
