# 🧠 Activity Intelligence Layer  
**Cost Control + Uniqueness + Data Moat Architecture**

---

## 🎯 Objective

- Reduce external API costs (Google Places, etc.)
- Maintain itinerary uniqueness
- Build proprietary location intelligence
- Enable AI retrieval from owned data (RAG)
- Prevent database bloat

---

# 1️⃣ Core Philosophy

We are not building a directory.

We are building a curated, engagement-aware activity intelligence layer.

Uniqueness comes from:
- Composition
- Personalization
- Sequencing
- Feedback loops

Not from infinite place count.

---

# 2️⃣ Data Model

## City

```ts
City {
  id: string
  name: string
  country: string
  tier: 1 | 2 | 3
  lastEnrichedAt: Date
  enrichmentScore: number
  activityCount: number
}
```

## Activity

```ts
Activity {
  id: string
  cityId: string
  source: "google" | "user" | "curated"
  externalId?: string
  name: string
  lat: number
  lng: number
  category: string
  rating?: number
  priceLevel?: number
  metadataJson?: object
  engagementScore: number
  embeddingVector?: number[]
  lastVerifiedAt: Date
  createdAt: Date
}
```

## Experience (User Generated)

```ts
Experience {
  id: string
  hostId: string
  cityId: string
  title: string
  description: string
  tags: string[]
  price: number
  embeddingVector?: number[]
  engagementScore: number
}
```

---

# 3️⃣ Enrichment Strategy

## On Trip Creation

1. Extract unique cities.
2. For each city:
   - Check category coverage.
   - If below threshold → enrich via external API.
   - If sufficient → skip API call.

### Example Coverage Threshold

- ≥ 3 restaurants
- ≥ 2 landmarks
- ≥ 2 culture
- ≥ 2 outdoors
- ≥ 2 nightlife

Minimum total target:
- Tier 1: 40–80 activities
- Tier 2: 20–40 activities
- Tier 3: 10–20 activities

---

# 4️⃣ Tiering Strategy

Do NOT enrich the entire planet.

### Tier 1  
High-traffic cities.  
High enrichment density.

### Tier 2  
Moderate demand.  
Balanced enrichment.

### Tier 3  
Long-tail.  
Minimal enrichment.

Prioritize based on usage frequency and revenue potential.

---

# 5️⃣ Engagement Scoring

Each activity gets a dynamic `engagementScore`.

## Score Inputs

- Added to itinerary
- Removed from itinerary
- Booked
- Saved
- Time viewed
- User rating
- Repeat inclusion rate

Low-performing activities:
- Down-ranked
- Archived
- Pruned

Prevents database bloat.

---

# 6️⃣ RAG Layer (Retrieval-Augmented Generation)

## Why

Without retrieval:
- AI hallucinates places
- Repeats obvious suggestions
- Drifts outside inventory

With retrieval:
AI assembles only from validated internal inventory.

---

## Embedding Strategy

Each Activity / Experience stores:

- Embedding vector
- Category
- Tags
- Metadata
- Engagement score

Embedding input example:

```
Name: Brandenburg Gate  
Category: Landmark  
City: Berlin  
Tags: history, architecture, iconic, central  
Description: 18th-century neoclassical monument...
```

---

## Retrieval Flow

User Input → Extract:

- Cities
- Vibe
- Budget
- Group type
- Pace
- Preferences

Then:

1. Filter by `cityId`
2. Filter by category / price range
3. Vector similarity search
4. Rank by:
   - Similarity score
   - engagementScore
   - Novelty bias

Return Top 30–50 candidates.

AI assembles itinerary from these only.

No external API calls during assembly.

---

# 7️⃣ Uniqueness Engine

Uniqueness comes from:

- Category weighting
- Group-aware filtering
- Time-of-year logic
- Weather adjustments
- Pace logic
- Prior user history
- Novelty scoring

Optional:
Track recently served activities per user and apply diversity bias.

---

# 8️⃣ Cost Control Strategy

- Enrich once.
- Store normalized data.
- Revalidate asynchronously (TTL 30–60 days).
- Cap monthly enrichment budget.
- Prioritize Tier 1 cities.

Never call external APIs during itinerary generation.

---

# 9️⃣ Database Growth Strategy

Sources:

- Controlled Google enrichment
- User-created experiences
- Booking partners
- Manual curation

Moat grows through:
- Engagement data
- Personalization refinement
- Host contributions
- Feedback loops

---

# 🔟 When Is It Too Much?

Too much is not defined by place count.

Too much is defined by:

- Redundancy
- Low engagement
- Category oversaturation
- Duplicate similarity > 90%
- Stale data

Prune accordingly.

---

# 🚀 Long-Term Evolution

Stage 1: API-dependent  
Stage 2: Cached enrichment  
Stage 3: Curated database  
Stage 4: Engagement-optimized  
Stage 5: Predictive personalization  

Goal:

Outperform external APIs in relevance per user.