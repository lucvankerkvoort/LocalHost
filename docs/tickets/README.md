# Sprint Tickets — Database Simplification (April 2026)

Seven tickets for moving from the current over-engineered schema to a JSONB-first Postgres model with Redis caching.

## Order of execution

| Ticket | Title | Priority | Points | Status |
|--------|-------|----------|--------|--------|
| [LH-101](./LH-101-simplify-postgres-schema.md) | Simplify Postgres schema to 3-table JSONB model | Critical | 5 | Open |
| [LH-102](./LH-102-redis-caching-layer.md) | Set up Redis caching layer for AI responses | Critical | 5 | Open |
| [LH-103](./LH-103-write-through-redis-postgres.md) | Implement write-through pattern: Redis to Postgres on save | High | 3 | Open |
| [LH-104](./LH-104-remove-rag-pipeline.md) | Remove RAG pipeline and vector embedding infrastructure | High | 2 | Open |
| [LH-105](./LH-105-model-tiering.md) | Implement model tiering: Haiku for suggestions, Sonnet for planning | High | 3 | Open |
| [LH-106](./LH-106-prompt-caching.md) | Enable Anthropic prompt caching for system prompts | Medium | 2 | Open |
| [LH-107](./LH-107-jsonb-audit-trigger.md) | Add JSONB pattern audit trigger at 100 saved trips | Medium | 1 | Open |

**Total: 21 points**

## Workflow

Delete the ticket file when the work is merged. When this directory is empty, the sprint is done.

## Dependency graph

```
LH-101 ──┬── LH-102 ── LH-103
          ├── LH-107
          └── (LH-104 can run in parallel)

LH-105 and LH-106 are independent after the foundation is in place.
```
