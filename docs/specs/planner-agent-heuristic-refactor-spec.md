# Planner Agent Heuristic Refactor Spec

**Author:** Architect  
**Status:** Draft  
**Last Updated:** 2026-02-18  

## 0. Purpose
Refactor the Planner Agent from a fixed, wizard-style question sequence into a state-aware, heuristic-driven agent that performs localized plan repair. This spec defines the architecture, invariants, action model, and implementation plan. It is intentionally explicit and constraint-driven.

## 1. Scope
### In Scope
- Replace rigid question sequencing with gap-driven planning logic.
- Introduce an evaluation loop that inspects current planner state + itinerary on every turn.
- Implement localized plan repair for non-fatal violations.
- Add planner health checks and invariant classification (fatal vs local).
- Introduce a structured PlannerAction response surface for the agent.
- Update the conversation adapter to render PlannerActions without re-ordering logic.

### Out of Scope
- New UI flows or pages.
- Full rewrite of orchestrator or trip planning pipeline.
- Changing database schema (unless explicitly required for issue tracking).
- Replacing Cesium/globe rendering logic.
- Replacing existing tool registry or response handling framework.

## 2. Constraints & Invariants
### Non-Negotiable Constraints
- Do NOT regenerate the full itinerary for local issues.
- Only perform full regeneration if a **fatal invariant** is violated.
- Existing UX (chat + globe) must remain functional; no new UI screens.
- The chat layer must not enforce question order.
- The system MUST preserve valid itinerary nodes when repairing a single node.

### Planner Invariants (Must Detect)
1. **INV-ANCHOR-VALID**: Anchors must have valid lat/lng inside trust boundaries.
2. **INV-ANCHOR-UNIQUE**: No duplicate anchors (same city or same coords within tolerance).
3. **INV-ROUTE-MONOTONIC** (road trips): Each day must progress toward destination; no backtracking.
4. **INV-ACTIVITY-DENSITY**: Each day must have minimum activity count (>= 2) unless explicitly marked as travel-only.
5. **INV-DESTINATION-VALID**: Origin/destination must be valid and resolvable.

### Invariant Severity
- **Fatal**: INV-DESTINATION-VALID, missing origin/destination, or no valid anchors at all.
- **Local**: invalid anchor coordinate, duplicate anchor, low activity density, minor route regression.

## 3. Architecture Overview (New Loop)
The Planner Agent must run the following loop on every user turn:
1. **State Inspection**: Load planner state + current itinerary snapshot.
2. **Issue Detection**: Evaluate invariants, produce a normalized list of `PlannerIssue`s.
3. **Action Selection**: Choose the next best `PlannerAction` based on issue priority and user intent.
4. **Execution**: 
   - If `AUTO_FIX`, apply localized mutations and continue.
   - If `SUGGEST_REPAIR`, present options.
   - If `ASK_USER`, ask a single question with reason.
   - If `CONTINUE_PLAN`, proceed with generation or partial expansion.

## 4. Data Model Implications
### 4.1 New Planner State Fields
Add to planner state (in-memory; persisted in conversation metadata):
- `knownFields`: record of known vs unknown fields.
- `issues`: list of current `PlannerIssue`s.
- `issueHistory`: list of resolved issues (for audit and to avoid loops).
- `anchorValidity`: per-anchor validation state (`VALID` | `INVALID` | `UNKNOWN`).

### 4.2 PlannerIssue Model
```
PlannerIssue = {
  id: string
  type: 'ANCHOR_INVALID' | 'ANCHOR_DUPLICATE' | 'ROUTE_NON_MONOTONIC' | 'ACTIVITY_DENSITY_LOW' | 'DESTINATION_INVALID'
  severity: 'FATAL' | 'LOCAL'
  target: { anchorId?: string; dayNumber?: number; field?: string }
  description: string
  detectedAt: ISODate
  suggestedFixes?: Array<PlannerAction> // concrete options
}
```

### 4.3 PlannerAction Model (Chat Contract)
```
PlannerAction =
  | { type: 'ASK_USER'; question: string; reason: string }
  | { type: 'AUTO_FIX'; change: PlannerMutation; justification: string }
  | { type: 'SUGGEST_REPAIR'; options: PlannerRepairOption[]; reason: string }
  | { type: 'CONTINUE_PLAN' }

PlannerMutation = { op: 'REMOVE_ANCHOR' | 'REPLACE_ANCHOR' | 'UPDATE_ANCHOR' | 'ADD_ACTIVITY' | 'REMOVE_ACTIVITY'; payload: ... }
PlannerRepairOption = { id: string; label: string; mutation: PlannerMutation }
```

### 4.4 Itinerary Node Annotation
Each anchor/stop should carry:
- `validity`: `VALID` | `INVALID` | `UNKNOWN`
- `issues`: array of issue IDs affecting that node

## 5. Implementation Plan
### Step 1: Planner Evaluation Function
Create `evaluatePlannerState(state, itinerary) -> PlannerIssue[]`:
- Runs invariant checks.
- Classifies issues (fatal/local).
- Attaches issues to nodes.
- Output deterministic ordering by severity + priority.

### Step 2: Issue Classification Model
Implement a strict mapping:
- Invalid origin/destination => FATAL.
- Any invalid anchor with valid trip endpoints => LOCAL.
- Duplicates => LOCAL.
- Route monotonicity (road trips) => LOCAL if only 1-2 days; FATAL if entire route invalid.
- Activity density low => LOCAL.

### Step 3: Localized Repair Handlers
Implement targeted mutation handlers:
1. **Remove Anchor**: Delete anchor + associated activities; reflow days.
2. **Replace Anchor**: Re-run resolve_place for a single anchor using enhanced context.
3. **Re-route**: Insert intermediate anchors between two cities for road trip; keep existing anchors if valid.

### Step 4: Conversation Adapter Changes
Chat layer must:
- Render `PlannerAction` objects directly.
- Ask single question when `ASK_USER`.
- Present `SUGGEST_REPAIR` options and send chosen option as structured response.
- Never sequence questions itself.

## 6. Pseudocode (Planner Decision Loop)
```
function plannerTurn(userInput, state, itinerary):
  state = hydrateState(state, userInput)
  issues = evaluatePlannerState(state, itinerary)
  state.issues = issues

  if hasFatal(issues):
     return ASK_USER("Your trip endpoints seem invalid. Where should we start and end?", reason)

  localIssue = firstLocalIssue(issues)
  if localIssue:
     if canAutoFix(localIssue):
        mutation = buildAutoFix(localIssue)
        applyMutation(itinerary, mutation)
        return AUTO_FIX(mutation, "Fixed invalid anchor")
     else:
        options = buildRepairOptions(localIssue)
        return SUGGEST_REPAIR(options, "We found an issue with Kingman, AZ.")

  if missingCriticalInfo(state):
     return ASK_USER(nextGapQuestion(state), reason)

  return CONTINUE_PLAN()
```

## 7. Migration Plan (Wizard → Heuristic)
1. **Phase 1: Passive Evaluation**
   - Keep existing wizard flow.
   - Compute issues in background; log only.

2. **Phase 2: Hybrid**
   - Allow planner to override wizard order when fatal/local issues exist.
   - Keep wizard fallback when no issues exist.

3. **Phase 3: Full Heuristic**
   - Remove hardcoded question order.
   - Use `PlannerAction` exclusively.

## 8. Test Requirements
### Unit Tests
- `evaluatePlannerState` detects invalid anchor and classifies as LOCAL.
- `evaluatePlannerState` detects invalid destination and classifies as FATAL.
- `buildPlannerRequest` still respects transport preferences.
- `repair handlers` preserve unaffected anchors.

### Integration Tests
- Road trip with one invalid anchor results in SUGGEST_REPAIR, not full regeneration.
- Multi-city flight plan still works with CONTINUE_PLAN.
- Chat adapter renders ASK_USER exactly once and does not reorder questions.

## 9. Acceptance Criteria (Pass/Fail)
1. Planner produces `PlannerAction` outputs for all turns (no hardcoded question ordering).
2. A single invalid anchor triggers localized repair; other anchors remain unchanged.
3. Full regeneration occurs only for fatal invariant failures.
4. Chat layer renders actions as-is without adding ordering logic.
5. Unit + integration tests pass.
