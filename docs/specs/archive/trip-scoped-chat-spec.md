# Trip-Scoped Chat Spec

## Problem Statement
The AI chat widget currently uses a single `chat-general` thread for all trip pages. The chat `id` is also used as the server-side session identifier for agent context. This causes conversation state and tool effects to bleed between different trips.

We need the AI chat to be explicitly scoped to a `tripId` whenever the user is on a trip detail page so that each trip has an isolated conversation thread and session context.

## Scope
- AI chat widget (`/api/chat` + client `useChat`) on trip detail pages (`/trips/{tripId}`) must be scoped to the active `tripId`.
- The chat request payload should include `tripId` when available so the backend has explicit trip context.
- Host onboarding chat (become-host flow) must continue using draft-scoped chat ids and must not be trip-scoped.

## Out of Scope
- P2P booking chat threads and booking messages.
- Persisting AI chat transcripts to the database.
- Changing agent routing logic or tool behavior.
- Multi-user collaboration or shared trip chats.

## Current Behavior (Contract)
- `ChatWidget` uses `getChatId(intent, pathname)` to build a stable `id` for `useChat`.
- For `general` intent, the id is `chat-general` for all pages.
- For `become_host`, the id is `chat-become_host` or `chat-become_host-{draftId}`.
- `/api/chat` passes the request `id` to agents as `sessionId`.

## Desired Behavior
- On `/trips/{tripId}`, the AI chat `id` must include the `tripId` so it is isolated per trip.
- When a `tripId` is present, the API request body must include `tripId`.
- On non-trip pages (no `tripId`), chat behavior remains unchanged.
- Host onboarding chat ids remain draft-scoped and ignore `tripId`.

## Constraints & Invariants
- **Must not** change P2P booking chat functionality.
- **Must not** alter host onboarding handshake behavior or ids.
- **Must not** introduce new persistence or database migrations.
- **Must not** change agent routing or system prompts.
- Chat id format must remain stable for a given trip so history persists across reloads.

## Design
### Chat ID Format
- General intent (trip-scoped): `chat-general-{tripId}`
- General intent (no tripId): `chat-general`
- Become-host intent: unchanged (`chat-become_host` or `chat-become_host-{draftId}`)

### Trip ID Resolution
- Use `activeTripId` from Redux when available.
- Fallback to parsing the route (`/trips/{tripId}`) if Redux has not hydrated yet.
- If neither is available, treat as non-trip context.

### Request Body
- `/api/chat` must accept optional `tripId`.
- When present, pass `tripId` through to the agent context (even if unused today).

## Test Requirements
- Update unit tests for `getChatId` to validate trip-scoped ids.
- Verify host onboarding `getChatId` behavior is unchanged.

## Acceptance Criteria (Pass/Fail)
1. On `/trips/trip-a`, `useChat` uses `chat-general-trip-a` (or equivalent) and does not reuse history from `trip-b`.
2. On `/trips/trip-b`, the chat history is isolated from `trip-a`.
3. On non-trip routes, the chat id remains `chat-general`.
4. On become-host routes, chat ids remain draft-scoped and do not include `tripId`.
5. `/api/chat` receives `tripId` when available and does not error when it is absent.
