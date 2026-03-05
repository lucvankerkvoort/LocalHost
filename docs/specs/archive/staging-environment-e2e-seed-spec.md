# Technical Spec — E2E Staging Environment

Date: 2026-02-02  
Author: Infrastructure Architect  
Scope: Staging database with deterministic seed data for E2E testing

---

## 1. Scope

### Included
- Isolated staging database configuration
- Idempotent seed script with named actors and scenarios
- E2E test fixture integration
- Reset mechanism for clean state

### Excluded
- Production data migration
- CI/CD pipeline changes (separate spec)
- Stripe Connect test mode setup (documented but not implemented)

---

## 2. Current State

### Existing Seed Script
File: [prisma/seed.ts](file:///Users/lucvankerkvoort/Documents/LocalHost/prisma/seed.ts)

**What exists:**
- Clears all data before seeding (idempotent)
- Creates host users from `HOSTS` data with full Stripe mock
- Creates 1 demo guest (`demo@localhost.com`)
- Creates 1 traveler (`guest@localhost.com`)
- Creates experiences + availability (14 days)
- Creates 1 TENTATIVE booking
- Creates 1 CONFIRMED booking with messages

**Gaps:**
- No named E2E actors (`traveler_full_access`, `host_full_access`, etc.)
- No scenario-based seeding structure
- Guest/traveler can't create experiences (not host-enabled)
- No dual-role user (host AND traveler)
- No admin/debug user

### Database Configuration
- Single `DATABASE_URL` in `.env`
- No staging isolation

---

## 3. Desired Behavior

### 3.1 Environment Isolation

```
# .env.local (development)
DATABASE_URL=postgresql://...localhost:5432/localhost_dev

# .env.staging (E2E testing)  
DATABASE_URL=postgresql://...localhost:5432/localhost_staging
```

**Environment switching:**
```bash
# Run E2E tests against staging
DOTENV_CONFIG_PATH=.env.staging npx playwright test
```

### 3.2 Named Actors (Mandatory)

| Actor ID | Email | Capabilities |
|----------|-------|--------------|
| `traveler_full_access` | `traveler@e2e.localhost` | Book, chat, trip creation |
| `host_full_access` | `host@e2e.localhost` | Create/publish experiences, accept bookings, chat |
| `host_and_traveler` | `dual@e2e.localhost` | All host + all traveler capabilities |
| `admin_debug` | `admin@e2e.localhost` | All + debug access (future) |

**All actors MUST have:**
```typescript
{
  isVerified: true,
  verificationTier: 'VERIFIED',
  // For hosts:
  isHost: true,
  stripeOnboardingStatus: 'COMPLETE',
  chargesEnabled: true,
  payoutsEnabled: true,
}
```

### 3.3 Named Scenarios

| Scenario | Description | Seeded State |
|----------|-------------|--------------|
| `happy_path_booking` | Complete booking flow test | TENTATIVE booking for `traveler_full_access` with `host_full_access` experience |
| `messaging_enabled` | P2P chat test | CONFIRMED booking with `chatUnlocked: true`, 2 messages |
| `dual_role_flow` | Host switches to traveler mode | Trip for `host_and_traveler` + separate experience ownership |

### 3.4 Experience Availability

All seeded experiences must have availability:
- Next 30 days (not 14)
- At least 4 spots per day
- No time slots (date-only per current system)

### 3.5 Booking States

| Scenario | Status | Payment | Chat |
|----------|--------|---------|------|
| `happy_path_booking` | TENTATIVE | PENDING | false |
| `messaging_enabled` | CONFIRMED | PAID | true |
| `completed_booking` | COMPLETED | PAID | true |

---

## 4. Constraints (Non-Negotiable)

### Files That MUST NOT Change
- `prisma/schema.prisma` — No schema changes
- Production `.env` — Never touch

### Patterns That MUST Be Used
- Static IDs for all E2E actors (deterministic)
- Idempotent: `deleteMany()` before create
- Bcrypt hashed passwords

### Patterns That MUST Be Avoided
- Random data generation
- Dynamic IDs (use `cuid()` only for non-E2E entities)
- Real Stripe API calls during seeding

### Data Constraints
- E2E actor IDs prefixed with `e2e-`
- E2E experience IDs prefixed with `exp-e2e-`
- E2E booking IDs prefixed with `booking-e2e-`

---

## 5. Interfaces & Contracts

### E2E Test Fixture Updates

Add to [e2e/fixtures.ts](file:///Users/lucvankerkvoort/Documents/LocalHost/e2e/fixtures.ts):

```typescript
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// E2E Actor Constants
export const E2E_ACTORS = {
  TRAVELER: {
    id: 'e2e-traveler-full-access',
    email: 'traveler@e2e.localhost',
    password: requiredEnv('E2E_TRAVELER_PASSWORD'),
  },
  HOST: {
    id: 'e2e-host-full-access',
    email: 'host@e2e.localhost',
    password: requiredEnv('E2E_HOST_PASSWORD'),
  },
  DUAL: {
    id: 'e2e-host-and-traveler',
    email: 'dual@e2e.localhost',
    password: requiredEnv('E2E_DUAL_PASSWORD'),
  },
  ADMIN: {
    id: 'e2e-admin-debug',
    email: 'admin@e2e.localhost',
    password: requiredEnv('E2E_ADMIN_PASSWORD'),
  },
} as const;

export const E2E_SCENARIOS = {
  HAPPY_PATH_BOOKING: 'booking-e2e-happy-path',
  MESSAGING_ENABLED: 'booking-e2e-messaging',
  DUAL_ROLE_TRIP: 'trip-e2e-dual-role',
} as const;
```

### Seed Script API

```bash
# Seed staging database
npm run db:seed:staging

# Reset staging (clean + seed)
npm run db:reset:staging

# Verify seed integrity
npm run db:verify:staging
```

---

## 6. Implementation Plan

### 6.1 New Files

| File | Purpose |
|------|---------|
| `.env.staging` | Staging database URL |
| `prisma/seed-staging.ts` | E2E-specific seed script |
| `scripts/reset-staging.sh` | Reset + seed wrapper |

### 6.2 Seed Script Structure

```typescript
// prisma/seed-staging.ts

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const E2E_PASSWORDS = {
  TRAVELER: requiredEnv('E2E_TRAVELER_PASSWORD'),
  HOST: requiredEnv('E2E_HOST_PASSWORD'),
  DUAL: requiredEnv('E2E_DUAL_PASSWORD'),
  ADMIN: requiredEnv('E2E_ADMIN_PASSWORD'),
} as const;

interface E2EActor {
  id: string;
  email: string;
  password: string;
  isHost: boolean;
  isTraveler: boolean; // Can book experiences
}

const E2E_ACTORS: E2EActor[] = [
  {
    id: 'e2e-traveler-full-access',
    email: 'traveler@e2e.localhost',
    password: E2E_PASSWORDS.TRAVELER,
    isHost: false,
    isTraveler: true,
  },
  {
    id: 'e2e-host-full-access',
    email: 'host@e2e.localhost',
    password: E2E_PASSWORDS.HOST,
    isHost: true,
    isTraveler: false,
  },
  {
    id: 'e2e-host-and-traveler',
    email: 'dual@e2e.localhost',
    password: E2E_PASSWORDS.DUAL,
    isHost: true,
    isTraveler: true,
  },
  {
    id: 'e2e-admin-debug',
    email: 'admin@e2e.localhost',
    password: E2E_PASSWORDS.ADMIN,
    isHost: true,
    isTraveler: true,
  },
];

async function seedE2EActors(prisma: PrismaClient) { ... }
async function seedE2EExperiences(prisma: PrismaClient) { ... }
async function seedE2EAvailability(prisma: PrismaClient) { ... }
async function seedE2EScenarios(prisma: PrismaClient) { ... }
```

### 6.3 Package.json Scripts

```json
{
  "scripts": {
    "db:seed:staging": "dotenv -e .env.staging -- npx prisma db seed",
    "db:reset:staging": "dotenv -e .env.staging -- npx prisma migrate reset --force",
    "db:verify:staging": "dotenv -e .env.staging -- tsx scripts/verify-staging.ts"
  }
}
```

---

## 7. Testing Requirements

### E2E Test Authentication

Tests must authenticate via seed credentials:

```typescript
test('host can accept booking', async ({ page }) => {
  // Login as host
  await page.goto('/auth/signin');
  await page.fill('[name="email"]', E2E_ACTORS.HOST.email);
  await page.fill('[name="password"]', E2E_ACTORS.HOST.password);
  await page.click('button[type="submit"]');
  
  // Navigate to bookings
  await page.goto('/bookings');
  // ...
});
```

### Acceptance Criteria

| Criterion | Pass Condition |
|-----------|----------------|
| Actor seeding | 4 E2E actors created with correct permissions |
| Experience seeding | Host's experience has 30-day availability |
| Scenario seeding | All 3 scenarios have correct booking states |
| Idempotency | Running seed twice produces identical state |
| Isolation | Staging DB is separate from dev |

---

## 8. Out-of-Scope

### Intentionally Deferred
| Item | Reason |
|------|--------|
| Stripe webhook mocking | Requires separate test mode setup |
| OAuth provider mocking | Already handled in fixtures.ts |
| CI/CD integration | Separate infrastructure spec |
| Database snapshot/restore | Future optimization |

---

## Appendix: Files to Create/Modify

### Create
- `.env.staging`
- `prisma/seed-staging.ts`
- `scripts/verify-staging.ts`
- `scripts/reset-staging.sh`

### Modify
- `e2e/fixtures.ts` — Add E2E actor constants
- `package.json` — Add staging scripts
- `prisma/seed.ts` — Optionally merge or keep separate
