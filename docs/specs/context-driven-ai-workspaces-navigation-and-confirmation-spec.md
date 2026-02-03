# Technical Spec — Navigation as Confirmation and Mutation Visibility

Date: 2026-02-03
Owner: Architect
Status: Ready for Implementer

## 1. Scope

### In Scope
- Navigation-first confirmation model.
- Mutation visibility guarantees.
- Confirmation policy for reversible vs destructive actions.

### Excluded
- New design system components.
- Non-AI unrelated navigation refactors.

## 2. Required UX Policy

## 2.1 Reversible Operational Actions
Examples:
- create trip
- create experience draft
- set availability (date-only)

Policy:
- operation executes
- user is navigated to canonical accountable route when route change is part of operation
- toast/snackbar confirms success
- no blocking confirmation dialog

## 2.2 Destructive Actions (All require confirmation dialog)
- delete trip
- delete experience draft
- delete published experience
- delete stop
- delete availability date

## 2.3 Irreversible Actions
- publish
- payment/booking confirmations

Policy:
- explicit user action required
- no silent AI execution

## 3. Mutation Visibility Invariant

For every AI-initiated successful mutation:
1. user receives explicit UI signal (navigation and/or toast)
2. mutated state is visible in workspace UI
3. persisted state reflects mutation

Hidden-only mutation is prohibited.

## 4. Constraints

- No modal confirmations for reversible non-destructive operations.
- Destructive operations cannot bypass confirmation via persona automation.

## 5. Acceptance Criteria (Binary)

1. Reversible operations complete with non-blocking UX and explicit success signal.
2. All listed deletions require confirmation dialogs.
3. Publish/payment confirmations are never auto-executed.
4. Every successful AI mutation is visible in UI state.

## 6. Testing Requirements

### Unit
- action classification: reversible vs destructive vs irreversible.
- mutation success emits required confirmation signal.

### E2E
- create workspace flows navigate correctly and show success feedback.
- each deletion path blocks until confirmation.
- irreversible actions require explicit user click/confirm.
