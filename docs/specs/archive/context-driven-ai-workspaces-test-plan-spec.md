# Technical Spec — Test Plan for Context-Driven AI Workspaces

Date: 2026-02-03
Owner: Architect
Status: Ready for Implementer

## 1. Scope

### In Scope
- Required unit/integration/E2E coverage for this epic.
- Regression guardrails for persona isolation and workspace routing.

### Excluded
- Load/perf benchmarking suite.
- Long-term memory tests.

## 2. Test Matrix

## 2.1 Unit Tests (Mandatory)

1. Persona selector
- route -> persona mapping is deterministic.
- non-workspace routes always select General persona.

2. Chat reset controller
- reset on persona change.
- reset on workspace ID change within same persona.
- no reset when route remains same workspace.

3. Snapshot builder
- emits required schema fields.
- known/missing fields accurate by state.

4. Handoff lifecycle
- intent reducer -> structured payload.
- payload consumed once and cleared.

5. Mutation policy classifier
- reversible/destructive/irreversible classification is correct.

## 2.2 Integration Tests (Mandatory)

1. General persona operational call creates workspace then navigates.
2. New persona receives snapshot and emits first message.
3. No transcript leakage across context transitions.

## 2.3 E2E Tests (Mandatory)

### Trips
- "plan food trip to Japan" -> `/trips/{tripId}` -> planner auto first message.
- switch trip IDs -> chat reset + new snapshot prompt.

### Experiences
- "become a host" -> `/experiences/{id}` -> host auto first message.
- set availability outside globe -> date-only state update + toast.
- workspace ID switch -> chat reset + new snapshot prompt.

### Safety and Confirmation
- delete trip/experience draft/published experience/stop/date each requires confirm dialog.
- publish/payment/booking confirmations require explicit user action.

## 3. Regression Prohibitions (Must Stay Green)

1. Agent cannot act in wrong persona for route.
2. Agent cannot reference previous-context chat.
3. Agent cannot mutate state invisibly.
4. Public published experience routes remain unchanged.

## 4. Completion Gate

Implementation is incomplete unless:
- required unit tests pass
- required E2E tests pass
- typecheck and lint pass
- acceptance criteria from all epic specs pass
