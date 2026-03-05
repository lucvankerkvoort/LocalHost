# Implementation Spec — State-Aware Host Onboarding Resume Flow

Date: 2026-02-03  
Owner: Architect  
Status: Ready for Implementer

## 1) Problem Statement

The proactive host onboarding opener currently starts with a city-first question for new/empty drafts, but that behavior is incorrect for partially or fully completed drafts.

Required behavior:
- If city is missing, ask for city.
- If city exists and stops exist, do **not** ask city again.
- If core details are missing (title/descriptions), continue from that gap.
- If all required fields are present, ask what help is needed next.

## 2) Scope

### In Scope
- `/become-host` and `/become-host/[draftId]` proactive handshake behavior.
- Host onboarding opener selection based on current draft completeness.
- Agent continuation logic from current draft state.
- Unit + E2E coverage for state-aware opener behavior.

### Out of Scope
- Visual redesign of host editor panels.
- Changes to publish/business rules.
- Pricing/availability automation (can be suggested, not auto-managed here).

## 3) Data Contract (Source of Truth)

Draft completeness must be derived from the host draft state already persisted in DB and hydrated into client state:
- `city`
- `stops[]`
- `title`
- `shortDesc`
- `longDesc`
- `duration`

The implementation must treat blank strings (`''` or whitespace) as missing.

## 4) Required State Model

Define a deterministic stage enum:
- `CITY_MISSING`
- `STOPS_MISSING`
- `DETAILS_MISSING`
- `READY_FOR_ASSIST`

Stage resolution order (first match wins):
1. `CITY_MISSING` if city is missing.
2. `STOPS_MISSING` if city exists and stop count is `0`.
3. `DETAILS_MISSING` if any of `title`, `shortDesc`, `longDesc` are missing.  
   (`duration` may also be prompted in this stage, but does not block stage entry.)
4. `READY_FOR_ASSIST` when `city`, `stops`, `title`, `shortDesc`, `longDesc` all exist.

## 5) Behavioral Requirements

### 5.1 Silent Handshake Triggering
- Handshake remains one-shot and route-isolated to `/become-host*`.
- Handshake must wait until draft hydration is available for that route context.
- Handshake must send stage-aware metadata/token, not a blind generic trigger.
- If chat history already exists, handshake must not re-fire.

### 5.2 Stage-Aware First Assistant Message
- `CITY_MISSING`: opener asks for city first (varied phrasing allowed).
- `STOPS_MISSING`: opener asks for first meaningful stop/place.
- `DETAILS_MISSING`: opener asks to shape title/description from existing city/stops (no city question).
- `READY_FOR_ASSIST`: opener asks what to help with next (polish copy, refine stops, prep publish, etc.).

### 5.3 Tooling Behavior by Stage
- `CITY_MISSING`: avoid drafting title/descriptions before city is known.
- `STOPS_MISSING`: focus on collecting at least one stop before drafting long-form copy.
- `DETAILS_MISSING`: use `updateDetails` proactively from narrative input; do not re-collect city/stops unless user changes them.
- `READY_FOR_ASSIST`: do not overwrite existing details automatically; only change via explicit user request.

## 6) Non-Negotiable Constraints

- No city re-ask when city is already present.
- No handshake on non-host routes.
- No duplicate handshake firing in React Strict Mode.
- Preserve existing behavior for brand-new drafts (city-first still valid there).
- Do not modify unrelated UI components or global styling.

## 7) Implementation Targets

Primary files:
- `src/components/features/chat-widget.tsx`
- `src/components/features/chat-widget-handshake.ts`
- `src/lib/agents/host-creation-agent.ts`

Supporting (if needed for hydration-readiness signal):
- `src/store/host-creation-slice.ts`
- `src/components/features/host-creation/editor-layout.tsx`

## 8) Interface/Contract Additions

Handshake payload to `/api/chat` for `intent='become_host'` must include a draft snapshot or resolved stage (example):
- `onboardingStage: 'CITY_MISSING' | 'STOPS_MISSING' | 'DETAILS_MISSING' | 'READY_FOR_ASSIST'`

Agent must consume this stage and enforce stage-appropriate opener/rules.

## 9) Testing Requirements

### Unit Tests
1. Stage resolver:
   - missing city -> `CITY_MISSING`
   - city + no stops -> `STOPS_MISSING`
   - city + stops + missing title/desc -> `DETAILS_MISSING`
   - all required present -> `READY_FOR_ASSIST`
2. Opener generator:
   - city stage openers contain city ask
   - non-city stages do not force city ask
3. Handshake guard:
   - one-shot behavior
   - no non-host-route trigger
   - waits for hydration-ready state

### E2E Tests
1. New draft (empty): proactive city-first opener.
2. Draft with city+stops but missing details: proactive details-focused opener (no city ask).
3. Draft fully populated: proactive “what can I help with?” opener.
4. Refresh with existing chat history: no new proactive opener.

## 10) Acceptance Criteria (Binary)

1. Empty draft starts with city-first question.
2. Draft with city+stops does not ask city again; asks for title/description shaping.
3. Fully completed draft starts with “how can I help next?” style prompt.
4. Handshake still fires exactly once for empty history and never on non-host routes.
5. Unit and E2E tests for these flows pass.

## 11) Explicit Exclusions

- No changes to pricing/payment flows.
- No changes to publish validation schema.
- No conversational redesign outside onboarding opener/state progression.
