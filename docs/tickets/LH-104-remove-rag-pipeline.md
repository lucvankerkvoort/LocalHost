# LH-104 — Remove RAG pipeline and vector embedding infrastructure

| Field    | Value                    |
|----------|--------------------------|
| Type     | Task                     |
| Priority | High                     |
| Points   | 2                        |
| Labels   | cleanup, architecture    |

## Description

Strip out the RAG retrieval pipeline, vector embeddings, and any associated embedding generation jobs. Replace with a static curated JSON lookup for top destinations (pre-written summaries, key attractions, practical info) that gets injected into the AI system prompt. This eliminates embedding costs, retrieval latency, and a major source of hallucination-over-chunks. The curated data can be AI-generated offline in batch and version-controlled.

## Acceptance Criteria

- [ ] All vector embedding code, jobs, and storage removed from codebase
- [ ] Curated destination JSON file created with top 50 destinations
- [ ] System prompt injects relevant destination context from the JSON lookup
- [ ] No external embedding API calls remain in the application
- [ ] AI output quality for covered destinations is equal or better than RAG approach

## Notes

RAG can be reintroduced later when there is sufficient data volume (50k+ activities, user history) to justify the complexity. For now, deterministic lookups outperform retrieval.

## Dependencies

- Can be done in parallel with LH-101 (deletion task, no schema dependency)
