# Epic Spec Index — Context-Driven AI Workspaces (Trips & Experiences)

Date: 2026-02-03
Owner: Architect
Status: Ready for Implementer

This epic is defined by the following specification set:

1. `docs/specs/context-driven-ai-workspaces-architecture-spec.md`
2. `docs/specs/context-driven-ai-workspaces-state-handoff-bootstrap-spec.md`
3. `docs/specs/context-driven-ai-workspaces-trips-flow-spec.md`
4. `docs/specs/context-driven-ai-workspaces-experiences-flow-spec.md`
5. `docs/specs/context-driven-ai-workspaces-navigation-and-confirmation-spec.md`
6. `docs/specs/context-driven-ai-workspaces-test-plan-spec.md`

## Implementation Order (Required)

1. Route/persona activation contract and chat reset boundaries.
2. Snapshot schema and transient handoff pipeline.
3. Trips flow migration to `/trips/{tripId}` with planner-first bootstrap.
4. Experiences owner workspace migration to `/experiences/{id}` draft-first.
5. Navigation + toast/confirmation dialog policy enforcement.
6. Test matrix completion and regression lock.

## Global Non-Negotiables

- Route-only persona activation.
- Structured state is source of truth.
- No transcript continuity across persona transitions.
- No long-term memory in this epic.
- No invisible AI mutations.
