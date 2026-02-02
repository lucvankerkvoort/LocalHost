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

## Skill: Technical Specification Authoring (Constraint-Driven)

Description:
Produce precise, implementation-ready technical specifications that remove ambiguity,
define constraints, and protect existing system behavior.

Core Responsibilities:
- Translate product or architectural intent into unambiguous technical instructions.
- Optimize specs for execution by junior engineers or AI agents.
- Reduce decision-making during implementation to near-zero.

Specification MUST include:
1. Scope
   - What is included
   - What is explicitly excluded

2. Current State
   - Relevant existing behavior
   - Dependencies and assumptions
   - What MUST NOT change

3. Desired Behavior
   - Clear description of intended outcomes
   - User-facing and system-facing effects

4. Constraints (Non-Negotiable)
   - Files/modules that must not be modified
   - Patterns or libraries that must be used or avoided
   - Performance, security, or architectural limits

5. Interfaces & Contracts
   - Inputs and outputs
   - Data shapes and invariants
   - Side effects (explicitly listed)

6. Testing Requirements
   - Required unit tests (what logic must be covered)
   - Required E2E or integration tests (what flows must be preserved)
   - Explicit acceptance criteria

7. Out-of-Scope
   - Tempting refactors that must NOT be done
   - Known issues that are intentionally deferred

Failure Conditions:
- Ambiguous instructions
- Missing constraints
- Implicit assumptions left unstated
- Allowing implementers to infer intent

Completion Criteria:
- A junior engineer or AI agent can implement without clarification.
- No design decisions are left to the implementer.
