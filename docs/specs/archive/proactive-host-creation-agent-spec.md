# Implementation Spec — Proactive Host Creation Agent

Date: 2026-02-03
Owner: Architect
Status: Ready for Implementer

## 1. Scope

### In Scope
- **Frontend (`ChatWidget`)**: Implementation of a "Silent Handshake" mechanism to proactively trigger agent conversation upon page load contextually on `/become-host`.
- **Agent Logic (`HostCreationAgent`)**: Reworking the system prompt to implement the "Perfect Day" narrative framework and specific "Drafting Phase" finite state machine.
- **Tooling**: Ensuring `updateDetails` and related tools act as "Draft Sync" mechanisms that update the UI in real-time without user manual entry.
- **Engagement**: Implementation of randomized/varied conversation openers to reduce robotic feel.

### Excluded
- Visual redesign of the "Become a Host" form UI (split-screen layout remains).
- Changes to the underlying `Experience` database schema.
- Payment/Banking setup flows (this focuses on the creative content: Title, Description, Stops).
- Image generation for the experience (host must upload photos).
- Pricing algorithms (agent can suggest, but manual override required).

## 2. Current State

- **Passive Widget**: `ChatWidget` initializes but waits for `useChat` to receive user input or an explicit `append` call, which currently only happens on user action.
- **Static Prompting**: `HostCreationAgent` uses a fixed system prompt that treats the interaction as a slot-filling exercise rather than a creative workshop.
- **Disconnected State**: The agent asks for details (Title, Description) that the user has to "tell" it, rather than the agent "drafting" them based on a loose conversation.
- **Dependencies**: React AI SDK (`useChat`), Next.js App Router, current `ExperienceDraft` Prisma model.

## 3. Desired Behavior

- **The "Silent Handshake"**: Upon mounting `ChatWidget` with `intent='become_host'`, if the conversation history is empty, the widget automatically dispatches a hidden `system` or `user` message (e.g., `ACTION:START_HOST_ONBOARDING`). This triggers the Agent to generate the first visible message.
- **The "Perfect Day" Protocol**:
    - **Opener**: The agent selects one of 10+ varied opening questions (e.g., "If a friend visited you for 24 hours, where is the first place you'd take them?").
    - **Narrative Flow**: The agent refrains from asking for "Title" or "Description" directly. Instead, it asks for the *story* of the day.
    - **Drafting**: The agent explicitly transitions to a "Drafting" state where it uses tool calls to populate the form fields based on its synthesis of the user's story.
- **Automated Drafting**: As the user describes their day, the agent calls `updateDetails()` and `addStop()` in the background. The UI (State/Redux) updates immediately, showing the "Form" being filled out by the AI.

## 4. Constraints (Non-Negotiable)

- **Auth Enforcement**: Agent must strictly modify only the draft belonging to the authenticated user.
- **Route Isolation**: The "Silent Handshake" must ONLY trigger on `/become-host` and NOT on general chat routes or other pages.
- **History Persistence**: If a user leaves and returns, the conversation history must be preserved; the agent should not "restart" the silent handshake if messages already exist.
- **Performance**: The initial greeting must appear fast (under 1s perceived latency).
- **Files**: Do not modify global `globals.css` or unrelated components. Focus strict changes to `src/components/features/chat-widget.tsx` and `src/lib/agents/host-creation-agent.ts`.

## 5. Interfaces & Contracts

### Frontend (`ChatWidget`)
- **Inputs**: `intent` prop (string), `isActive` (boolean).
- **Side Effects**: Dispatches `append` action on mount if condition met.

### Backend (`HostCreationAgent`)
- **Inputs**: `messages` array, including hidden Trigger Token.
- **Outputs**: Streamed text response + Tool Calls (`updateDetails`, `addStop`).
- **Data Shapes**:
    - `updateDetails` payload must match existing `ExperienceDraft` partial schema (title: string, description: string, etc.).

## 6. Testing Requirements

### Unit Tests
- `ChatWidget`: Verify `append` is called exactly once on mount when conditions are met. verify no double-firing in React Strict Mode.
- `HostCreationAgent`: Test prompt handling of `ACTION:START_HOST_ONBOARDING` input to ensure it yields valid text output (not tool call errors).

### E2E Tests
1.  **Flow**: New User -> `/become-host` -> Chat opens -> Agent speaks first.
2.  **Flow**: User replies -> Agent calls `updateDetails` -> Form value updates.
3.  **Flow**: Refresh page -> No new greeting (history preserved).

### Acceptance Criteria
1.  **Proactive Start**: Visiting `/become-host` (new draft) results in the Agent sending the first message without user input.
2.  **Varied Openers**: Reloading the conversation (new session) yields different opening questions (at least 2 variations verified).
3.  **Draft Sync**: Mentioning a city and a place in chat results in those fields being populated in the draft form view essentially "hands-free".

## 7. Out-of-Scope

- Refactoring the entire `Agent` interface or base class.
- Adding "Multimodal" support (image inputs) to the chat widget for this task.
- Automating the "Price" or "Availability" tabs (focus is solely on the "Details" tab content).
