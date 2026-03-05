# Activity Intelligence (RAG) Architecture

This plan shifts LocalHost from an API-dependent wrapper around Google Places to a proprietary, engagement-driven recommendation engine using Retrieval-Augmented Generation (RAG).

## Goal
Reduce external API costs, eliminate AI hallucinations (validation failures), increase generation speed, and build a proprietary data moat of highly-curated itineraries.

## Proposed Architecture

1.  **Vector Database (Prisma + pgvector)**
    *   Enable the `pgvector` extension in PostgreSQL via Prisma's `postgresqlExtensions` preview feature.
    *   Introduce `City` and `Activity` models.
    *   Store 1536-dimensional embeddings (using `text-embedding-3-small`) for all Activities and user-generated Experiences.
    *   Denormalize `engagementScore` to track which places are actually kept in itineraries by users.

2.  **Enrichment Pipeline (Cost Control)**
    *   Before generation, check if the requested `City` exists.
    *   If `City.activityCount` is low (e.g., < 40 for Tier 1), trigger a background or synchronous enrichment job using the existing Google Places API / `resolve_place` utilities.
    *   Generate and store embeddings for new places.
    *   **Crucial Rule**: Never call the Google API inside the LLM generation loop.

3.  **Retrieval Engine (The Moat)**
    *   During itinerary generation, first perform a semantic search against the local `Activity` and `Experience` tables based on the user's prompt (e.g., "romantic spots in Paris").
    *   Use Prisma raw queries (`$queryRaw`) with vector math (`<=>` cosine distance) to retrieve the Top 50 mathematically relevant items.
    *   Weight the results by `engagementScore`.

4.  **Generation & Assembly**
    *   Inject the retrieved Top 50 places as a strict JSON inventory into the LLM system prompt.
    *   The LLM acts purely as an *assembler*, sequencing and narratively connecting the pre-validated inventory.
    *   This eliminates the mid-generation `resolve_place` loop entirely.

## User Review Required

> [!CAUTION]
> Applying the Prisma migration (`init_activity_rag`) will require resetting the local development database because adding `vector` extensions and altering existing tables (`Experience`) can conflict with existing mock data. Are you okay with running `npx prisma migrate reset` in your local environment to clear out old data and apply this new schema?

## Implementation Steps

### Phase 1: Database Migration
- [x] Update `schema.prisma` with `postgresqlExtensions` and vector types.
- [ ] Run `npx prisma migrate dev` (requires DB reset approval).

### Phase 2: Embedding Utility
- [ ] Create `src/lib/ai/embeddings.ts` using Vercel AI SDK and OpenAI to generate `vector(1536)` payloads.

### Phase 3: Retrieval Logic
- [ ] Build `src/lib/db/activity-search.ts` with `$queryRaw` to select nearest neighbors.

### Phase 4: Orchestrator Refactor
- [ ] Update `planning-agent.ts` to pre-fetch inventory and assemble the itinerary, removing the slow internal tool-calling loop for places.
