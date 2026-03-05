# Technical Spec — Context Handoff and Snapshot Bootstrap

Date: 2026-02-03
Owner: Architect
Status: Ready for Implementer

## 1. Scope

### In Scope
- Intent extraction to structured handoff payload.
- Transient handoff transport between personas during navigation.
- Snapshot schema used to bootstrap Planner and Host personas.

### Excluded
- Cross-session memory.
- User preference memory.

## 2. Current-State Problem

- Chat continuity currently acts as hidden context carrier.
- This risks persona bleed and brittle behavior across route transitions.

## 3. Required Handoff Model

### Intent Lifecycle
1. User message is parsed for intent.
2. Parsed intent is reduced to structured payload.
3. Operational action creates or updates workspace state.
4. Navigation to canonical workspace route occurs.
5. New persona bootstraps from snapshot.
6. Raw conversational context is discarded for decision-making.

### Handoff Storage (This Epic)
- Handoff must be transient in-memory/UI-store scoped to current navigation cycle.
- Handoff payload must be consumed on first bootstrap and then cleared.
- Handoff must not be persisted as long-term memory.

## 4. Snapshot Contract (Required Type Shape)

Implement shared snapshot contract for all workspace personas:
- `workspaceType: 'trip' | 'experience'`
- `workspaceId: string`
- `knownFields: Record<string, unknown>`
- `missingFields: string[]`
- `phase: string` (examples: `initial_planning`, `drafting`, `onboarding`, `review`)
- `hints?: string[]` (optional, from transient handoff)

## 5. Bootstrap Behavior

- Active persona MUST use snapshot as sole planning input.
- Bootstrap prompt MUST include `phase`, `knownFields`, and `missingFields`.
- If snapshot is missing required fields, persona asks schema-driven question.
- Persona must not request context from prior chat transcript.

## 6. Constraints

- No transcript replay across persona transitions.
- No hidden fallback to prior assistant messages.
- No persistent memory tables introduced in this epic.

## 7. Acceptance Criteria (Binary)

1. A message like "start a food trip to Japan" can hand off destination/theme context to Planner after navigation.
2. Planner starts from snapshot fields, not previous chat history.
3. Handoff data is cleared after bootstrap.
4. Returning to an existing workspace bootstraps from DB/store snapshot and current phase.

## 8. Testing Requirements

### Unit
- Intent reducer outputs stable structured handoff payload.
- Handoff store clears after first consume.
- Snapshot builder includes accurate known/missing fields.

### E2E
- Outside dashboard intent -> navigation -> new persona first message reflects handed-off context.
- Reload on workspace route still boots from persisted state without transcript dependency.
