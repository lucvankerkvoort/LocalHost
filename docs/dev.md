# Development Guide

## Setup
1) Copy `.env.example` → `.env` and set `DATABASE_URL`.
2) Install deps: `npm install`.
3) Recommended: configure branch-isolated Prisma schema for local migrations:
   - Set `PRISMA_BRANCH_ISOLATION=true`
   - Set `PRISMA_DEV_DATABASE_URL=<your dev postgres url>` (or rely on `DATABASE_URL`)
   - Optional: set `PRISMA_DB_SCHEMA_PREFIX=branch`

With branch isolation enabled, Prisma CLI uses:
- schema name: `<prefix>_<git_branch>` (sanitized)
- URL: `PRISMA_DEV_DATABASE_URL` (fallback: `DATABASE_URL`)

## Commands
- `npm run dev` — start Next.js.
- `npm run db:migrate` — migrations.
- `npm run db:generate` — Prisma client.
- `npm run db:seed` — seed data.
- `npm run db:studio` — Prisma Studio.

## Seeding
Seed uses `npx tsx prisma/seed.ts` via Prisma config.
If it fails, check:
- `DATABASE_URL` is set.
- `prisma/schema.prisma` datasource provider matches your DB.

## Common Issues
### 403 on `/api/host/availability`
You are not logged in as the host who owns the experience.

### 500 on trip plan save
Item types must match the Prisma enum (`SIGHT`, `EXPERIENCE`, etc).

### Prisma Client init error
`DATABASE_URL` missing or invalid.

### `prisma migrate dev` asks to reset due to drift
This usually means you are pointing at a shared schema. Enable branch isolation (`PRISMA_BRANCH_ISOLATION=true`) so each branch uses its own schema.
