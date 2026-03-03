# Technical Spec: Place Image Source Diversification and Verification Pipeline

**Status**: PROPOSED  
**Author**: Architect Agent  
**Date**: 2026-03-02  
**Input**: Requirement to prioritize Unsplash/Pexels and use Google only as fallback, with relevance verification and scoring.

## 1. Objective
Reduce Google Places image dependency and cost by introducing a multi-provider image pipeline:
1. Unsplash first
2. Pexels second
3. Google Places last fallback

Only verified images may be returned as primary results.

## 2. Scope
### 2.1 In Scope
- `/api/images/places` and `/api/images/places/list` retrieval paths.
- Provider adapters for Unsplash, Pexels, Google Places images.
- Deterministic relevance verification and LLM adjudication for borderline candidates.
- Durable persistence of accepted/rejected image candidates and scores.
- DB-first retrieval and async refresh behavior.
- Provider-level telemetry and cost accounting in `ExternalApiCall`.

### 2.2 Out of Scope
- Place geocoding/refinement logic (`resolve_place`, `geocodeCity`).
- Host-upload image ingestion flows.
- UI redesign.

## 3. Must-Not-Change Contracts
- Existing image endpoints must preserve response shape and fallback behavior.
- If no verified provider image exists, fallback image behavior must remain deterministic.
- Place planner/trip generation cannot block on slow image verification.

## 4. Non-Negotiable Invariants
1. Provider query order must be `UNSPLASH -> PEXELS -> GOOGLE_PLACES`.
2. Google Places image calls are allowed only if Unsplash and Pexels produce no accepted candidate.
3. Every provider call must pass through instrumented gateway clients and emit `ExternalApiCall`.
4. Every candidate image must receive a persisted verification record.
5. `VERIFIED` images may be returned directly; `REJECTED` images must never be returned.
6. LLM verification must run only for deterministic borderline band (defined in Section 7).
7. Query replay for the same cache key must be DB-first and must not re-run provider fetches before TTL expiry.

## 5. Data Model Requirements

## 5.1 Enums
Add:
- `ImageSourceProvider`: `UNSPLASH`, `PEXELS`, `GOOGLE_PLACES`
- `ImageVerificationStatus`: `VERIFIED`, `REJECTED`, `REVIEW`

## 5.2 PlaceImageAsset
Add durable image candidate table:
- `id` (cuid)
- `placeId` (nullable, FK to canonical `Place` once available)
- `queryKey` (normalized query, non-null)
- `provider` (`ImageSourceProvider`)
- `providerImageId` (non-null)
- `providerPhotoRef` (nullable, Google photo ref)
- `url` (non-null)
- `thumbnailUrl` (nullable)
- `width` (non-null)
- `height` (non-null)
- `attributionJson` (non-null JSON)
- `licenseCode` (non-null string)
- `photographerName` (nullable)
- `status` (`ImageVerificationStatus`)
- `deterministicScore` (float)
- `llmScore` (nullable float)
- `finalScore` (float)
- `reasonCodes` (string array)
- `verificationVersion` (string)
- `verifiedAt` (timestamp)
- `expiresAt` (timestamp)
- `createdAt`, `updatedAt`

Indexes and constraints:
- unique `(provider, providerImageId)`
- index `(queryKey, status, finalScore DESC)`
- index `(placeId, status, finalScore DESC)`
- index `(expiresAt)`

## 5.3 PlaceImageSelection
Add selected-image cache table:
- `id` (cuid)
- `queryKey` (unique)
- `placeId` (nullable)
- `assetId` (FK -> `PlaceImageAsset`)
- `provider` (`ImageSourceProvider`)
- `expiresAt`
- `createdAt`, `updatedAt`

Purpose: cheap DB-first read for endpoint hot path.

## 6. Architecture and Module Boundaries

## 6.1 Required Modules
- `src/lib/images/providers/unsplash-client.ts`
- `src/lib/images/providers/pexels-client.ts`
- `src/lib/images/providers/google-places-image-client.ts`
- `src/lib/images/image-verification.ts`
- `src/lib/images/image-selection-service.ts`

## 6.2 Provider Adapter Contract
Each provider adapter must return normalized candidates:
- `provider`
- `providerImageId`
- `url`
- `width`, `height`
- `title`
- `description`
- `tags: string[]`
- `city`, `country` (nullable)
- `attribution`
- `licenseCode`
- `safeFlag` (`SAFE`, `UNSAFE`, `UNKNOWN`)

## 6.3 Endpoint Contract
`/api/images/places*` must:
1. Compute `queryKey`
2. Read `PlaceImageSelection` DB-first
3. If valid and not expired: return immediately
4. If stale/missing: return best stale verified candidate if present, trigger async refresh
5. Only block on provider fetch when no verified/stale candidate exists

## 7. Verification and Relevance Scoring

## 7.1 Hard Reject Filters
Reject immediately when any true:
- Missing attribution metadata
- Missing or disallowed `licenseCode`
- `safeFlag == UNSAFE`
- `width < 800` or `height < 600`
- Exact duplicate of existing candidate (`provider + providerImageId`)

## 7.2 Deterministic Score Components
Scores are normalized `[0,1]`:
- `nameMatch` (weight `0.40`): fuzzy similarity between place/query tokens and title+description+tags
- `locationMatch` (weight `0.20`): city/country agreement with query context
- `categoryMatch` (weight `0.15`): category lexicon overlap (landmark/museum/restaurant/park/etc.)
- `qualityScore` (weight `0.15`): resolution and aspect-ratio fitness
- `specificityScore` (weight `0.10`): penalize generic/stock-style tags (`travel`, `vacation`, `people`, `lifestyle`) without place cues

Formula:
`deterministicScore = 0.40*nameMatch + 0.20*locationMatch + 0.15*categoryMatch + 0.15*qualityScore + 0.10*specificityScore`

## 7.3 Deterministic Decision Bands
- `deterministicScore >= 0.82`: `VERIFIED` (no LLM call)
- `deterministicScore < 0.45`: `REJECTED` (no LLM call)
- `0.45 <= deterministicScore < 0.82`: `REVIEW` -> LLM adjudication required

## 7.4 LLM Adjudication (Borderline Only)
For `REVIEW` band, call vision-capable model with strict JSON schema:
- `is_relevant: boolean`
- `confidence: number (0..1)`
- `reason_codes: string[]`

Final score formula:
`finalScore = 0.70*deterministicScore + 0.30*confidence`

Adjudication rules:
- if `is_relevant == true` and `finalScore >= 0.70` => `VERIFIED`
- else => `REJECTED`

LLM calls must be cached by `(queryKey, provider, providerImageId, verificationVersion)`.

## 8. Provider Selection Rules
For one query:
1. Fetch/verify Unsplash candidates; pick highest `VERIFIED`
2. If none, fetch/verify Pexels; pick highest `VERIFIED`
3. If none, fetch/verify Google Places candidates; pick highest `VERIFIED`
4. If still none, return fallback image

The first provider yielding a `VERIFIED` winner terminates provider chain.

## 9. TTL and Refresh
- `PlaceImageAsset.expiresAt`: 30 days
- `PlaceImageSelection.expiresAt`: 14 days

Refresh behavior:
- Serve stale verified image if present
- Trigger async refresh job
- Do not synchronously fan out to all providers when stale image exists

## 10. Telemetry and Cost KPIs
Must persist and report daily:
- `image_provider_hit_rate` per provider
- `image_external_calls_per_request`
- `image_cost_per_request`
- `image_verification_reject_rate`
- `image_llm_adjudication_rate`
- `image_google_fallback_rate`

## 11. Security and Abuse Controls
- Require auth or signed token for both places image endpoints.
- Enforce per-user and per-IP rate limits.
- Reject unsigned public traffic before provider calls.

## 12. Implementation Phases

### Phase A: Persistence + Deterministic Verification
Deliverables:
- New DB models/enums and migration
- Unsplash + Pexels provider adapters
- deterministic scorer and status persistence
- DB-first retrieval for endpoints

Exit gate:
- pass only if verified images are persisted and reused on repeated query
- pass only if Google call count drops for repeated common queries

### Phase B: LLM Borderline Adjudication
Deliverables:
- LLM verifier for review band only
- verdict caching
- final score persistence

Exit gate:
- pass only if LLM call rate stays below 20% of total candidates
- pass only if precision@1 improves versus deterministic-only baseline

### Phase C: Google Fallback + Hardening
Deliverables:
- Google fallback integrated at end of provider chain
- auth/signed endpoint gate
- provider KPI dashboard

Exit gate:
- pass only if Google is called only after Unsplash/Pexels miss
- pass only if unsigned requests do not invoke providers

## 13. Test Requirements

### 13.1 Unit
- score component determinism
- deterministic band thresholds
- LLM adjudication combination formula
- provider chain ordering

### 13.2 Integration
- DB-first cache hit avoids provider calls
- Unsplash winner short-circuits Pexels/Google
- Pexels winner short-circuits Google
- Google invoked only after upstream misses
- endpoint returns stale verified image while refresh runs

### 13.3 E2E
- trip itinerary cards receive stable verified images across reloads
- fallback image appears deterministically when no verified candidate exists

## 14. Binary Acceptance Criteria
1. Image provider order is enforced as Unsplash -> Pexels -> Google.
2. All returned non-fallback images are `VERIFIED` in DB.
3. Repeated identical queries are DB-served until TTL expiry.
4. LLM calls run only for review band and are cached.
5. Google image calls occur only after Unsplash and Pexels fail acceptance.
6. External image calls are fully ledgered in `ExternalApiCall`.
7. Unsigned public requests do not trigger external provider calls.

If any criterion fails, rollout is incomplete.
