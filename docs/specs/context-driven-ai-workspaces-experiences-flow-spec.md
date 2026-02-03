# Technical Spec — Experiences Workspace Flow (General -> Host/Accountant)

Date: 2026-02-03
Owner: Architect
Status: Ready for Implementer

## 1. Scope

### In Scope
- Draft-first experience workspace creation flow.
- General persona to Host/Accountant handoff.
- Availability handling (date-only) and confirmation behavior.
- Publish gating and deletion confirmations.

### Excluded
- Public published experience route redesign.
- Slot-level availability.
- Long-term memory.

## 2. Route and Identity Contract

- Owner workspace route: `/experiences/{id}`
- `{id}` is draft ID until publish.
- Public published experience routes remain unchanged (out of scope).

## 3. Flow Contract

### Become a Host / Create Experience Draft
1. User outside workspace routes expresses host intent.
2. General persona extracts structured intent.
3. System executes `createNewExperience(initialData)` as draft workspace.
4. Route changes to `/experiences/{id}`.
5. Chat resets.
6. Host/Accountant persona activates from route.
7. Host persona bootstraps from draft snapshot and speaks first.

## 4. Persona Responsibility Boundaries

### General Persona (Outside `/experiences/{id}`)
Allowed:
- create draft workspace
- set availability operationally (date-only)
- navigate to owner workspace

Requirements:
- show toast/snackbar after successful availability updates done outside globe

Forbidden:
- deep drafting
- publish actions
- hidden creative rewriting

### Host/Accountant Persona (Inside `/experiences/{id}`)
Allowed:
- onboarding guidance
- logistics structuring
- availability/payout workflows where supported
- next required onboarding question

Forbidden:
- auto-overwrite draft content without explicit request
- publish without explicit user action

## 5. Data and Safety Rules

- Availability model is date-only in this epic.
- Publish is explicit and irreversible; must be user-confirmed.
- Deletions require confirmation dialogs for:
  - experience draft
  - published experience
  - availability date
  - stop deletion

## 6. Constraints

- No slot-level availability implementation.
- No automatic creative drafting unless user explicitly requests it.
- No route-based ambiguity: `/experiences/{id}` always owner workspace context.

## 7. Acceptance Criteria (Binary)

1. New host intent creates draft workspace and navigates to `/experiences/{id}`.
2. Host/Accountant activates only from route context.
3. Chat resets on persona entry and on workspace ID switches.
4. Host first message is snapshot-driven and automatic.
5. Availability updates outside globe show toast/snackbar confirmation.
6. Publish requires explicit user action.
7. All deletion paths require confirmation dialog.

## 8. Testing Requirements

### Unit
- experience intent -> draft creation payload mapping.
- persona selector route mapping for experiences.
- availability updater uses date-only model.

### E2E
- dashboard host intent -> draft creation -> `/experiences/{id}` -> host first message.
- outside-globe availability set -> toast shown -> state updated.
- delete stop/date/draft/published experience each requires confirmation.
