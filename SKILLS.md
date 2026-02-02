# SKILLS

## CodeEdit
name: CodeEdit
inputs: File path and edit intent
assumptions:
- Workspace is writable
outputs: Updated file contents
cannot_do:
- Create new architecture

## FileDiff
name: FileDiff
inputs: Two file snapshots or a diff request
assumptions:
- Files exist
outputs: Unified diff
cannot_do:
- Apply changes

## TypeCheck
name: TypeCheck
inputs: Project root and config
assumptions:
- Dependencies installed
outputs: Typecheck report
cannot_do:
- Modify code

## LogInspection
name: LogInspection
inputs: Logs or stack traces
assumptions:
- Logs are complete
outputs: Extracted signals
cannot_do:
- Propose fixes

## InvariantValidation
name: InvariantValidation
inputs: Invariants and target output
assumptions:
- Invariants are explicit
outputs: Validation result
cannot_do:
- Edit files

## Skill: Feature Implementation (Test-Enforced)

Description:
Implement, modify, or refactor application functionality while preserving system stability and user-facing guarantees.

Requirements:
- Any introduced or modified decision-making logic MUST include unit tests.
  - Applies to reducers, selectors, transformers, builders, orchestration logic, and business rules.
- Unit tests MUST assert behavior, not implementation details.
- Changes that affect user-facing flows MUST be evaluated for E2E impact.

E2E Obligations:
- If a change affects navigation, routing, authentication, persona switching,
  trip creation/editing, persistence, booking, or payments:
  - A Playwright test MUST be added or updated.
- Smoke-level Playwright coverage is sufficient unless otherwise specified.

Completion Criteria:
- Implementation is NOT considered complete without required tests.
- Code output without tests is INVALID.
- All tests MUST pass locally and in CI.

Failure Conditions:
- Missing tests for modified logic
- Regressions in existing unit or E2E tests
- Introduction of untyped or unsafe logic without justification
