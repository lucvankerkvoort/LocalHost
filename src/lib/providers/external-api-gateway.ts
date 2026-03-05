import { createHash } from 'node:crypto';

import type { ExternalApiProvider } from '@prisma/client';

import { prisma } from '@/lib/prisma';

const DEFAULT_TIMEOUT_MS = 8000;
const BASE_BACKOFF_MS = 300;
const DEFAULT_RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
let budgetChecksEnabled = true;
let ledgerWritesEnabled = true;
let loggedMissingLedgerTable = false;
let loggedInvalidLedgerEnum = false;

export type ExternalApiCallContext = {
  tripId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
};

type ExternalApiRequest = {
  provider: ExternalApiProvider;
  endpoint: string;
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  retryableStatusCodes?: ReadonlySet<number>;
  estimatedCostMicros?: number;
  context?: ExternalApiCallContext;
};

type DailyUsage = {
  calls: number;
  costMicros: number;
};

export class ExternalApiBudgetExceededError extends Error {
  readonly provider: ExternalApiProvider;
  readonly endpoint: string;
  readonly code = 'BUDGET_EXCEEDED';

  constructor(provider: ExternalApiProvider, endpoint: string) {
    super(`Daily budget exceeded for ${provider} (${endpoint})`);
    this.name = 'ExternalApiBudgetExceededError';
    this.provider = provider;
    this.endpoint = endpoint;
  }
}

function parsePositiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return null;
  return Math.floor(parsed);
}

function providerPrefix(provider: ExternalApiProvider): string {
  return provider;
}

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2021'
  );
}

function isExternalApiProviderEnumError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return (
    message.includes('Expected ExternalApiProvider') ||
    message.includes('invalid input value for enum "ExternalApiProvider"') ||
    message.includes('Value') && message.includes('ExternalApiProvider')
  );
}

function disableBudgetChecksForSchemaDrift(reason: string): void {
  budgetChecksEnabled = false;
  if (!loggedInvalidLedgerEnum) {
    loggedInvalidLedgerEnum = true;
    console.warn(`[external-api] disabling budget checks: ${reason}`);
  }
}

function disableLedgerWritesForSchemaDrift(reason: string): void {
  ledgerWritesEnabled = false;
  if (!loggedInvalidLedgerEnum) {
    loggedInvalidLedgerEnum = true;
    console.warn(`[external-api] disabling ledger writes: ${reason}`);
  }
}

function resolveDailyCallCap(provider: ExternalApiProvider): number | null {
  const prefix = providerPrefix(provider);
  return (
    parsePositiveInt(process.env[`${prefix}_DAILY_CALL_CAP`]) ??
    parsePositiveInt(process.env.EXTERNAL_API_DAILY_CALL_CAP)
  );
}

function resolveDailyBudgetMicros(provider: ExternalApiProvider): number | null {
  const prefix = providerPrefix(provider);
  return (
    parsePositiveInt(process.env[`${prefix}_DAILY_BUDGET_MICROS`]) ??
    parsePositiveInt(process.env.EXTERNAL_API_DAILY_BUDGET_MICROS)
  );
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function readDailyUsage(provider: ExternalApiProvider): Promise<DailyUsage> {
  const dayStart = startOfUtcDay();
  const usage = await prisma.externalApiCall.aggregate({
    where: {
      provider,
      createdAt: {
        gte: dayStart,
      },
    },
    _count: {
      _all: true,
    },
    _sum: {
      estimatedCostMicros: true,
    },
  });

  return {
    calls: usage._count._all,
    costMicros: usage._sum.estimatedCostMicros ?? 0,
  };
}

async function assertBudgetAllowsCall(
  provider: ExternalApiProvider,
  endpoint: string,
  estimatedCostMicros: number
): Promise<void> {
  if (!budgetChecksEnabled) return;

  const callCap = resolveDailyCallCap(provider);
  const costCap = resolveDailyBudgetMicros(provider);

  if (!callCap && !costCap) return;

  try {
    const usage = await readDailyUsage(provider);

    if (callCap && usage.calls >= callCap) {
      throw new ExternalApiBudgetExceededError(provider, endpoint);
    }

    if (costCap && usage.costMicros + Math.max(0, estimatedCostMicros) > costCap) {
      throw new ExternalApiBudgetExceededError(provider, endpoint);
    }
  } catch (error) {
    if (error instanceof ExternalApiBudgetExceededError) {
      throw error;
    }
    if (isMissingTableError(error)) {
      budgetChecksEnabled = false;
      if (!loggedMissingLedgerTable) {
        loggedMissingLedgerTable = true;
        console.warn('[external-api] disabling budget checks until ExternalApiCall table is migrated');
      }
      return;
    }
    if (isExternalApiProviderEnumError(error)) {
      disableBudgetChecksForSchemaDrift(
        'ExternalApiProvider enum mismatch; run prisma migrations to include new provider values'
      );
      return;
    }
    // Fail open on telemetry read errors to avoid request path hard failures.
    console.warn('[external-api] budget check failed, allowing request', error);
  }
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);

  return `{${entries.join(',')}}`;
}

function computeRequestHash(options: {
  provider: ExternalApiProvider;
  endpoint: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}): string {
  return createHash('sha256')
    .update(
      stableStringify({
        provider: options.provider,
        endpoint: options.endpoint,
        method: options.method,
        url: options.url,
        headers: options.headers ?? {},
        body: options.body ?? null,
      })
    )
    .digest('hex');
}

function backoffDelayMs(attemptIndex: number): number {
  return BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attemptIndex - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recordExternalApiCall(input: {
  provider: ExternalApiProvider;
  endpoint: string;
  requestHash: string;
  statusCode: number | null;
  success: boolean;
  latencyMs: number;
  estimatedCostMicros: number;
  context?: ExternalApiCallContext;
}): Promise<void> {
  if (!ledgerWritesEnabled) return;

  try {
    await prisma.externalApiCall.create({
      data: {
        provider: input.provider,
        endpoint: input.endpoint,
        requestHash: input.requestHash,
        tripId: input.context?.tripId ?? null,
        sessionId: input.context?.sessionId ?? null,
        userId: input.context?.userId ?? null,
        statusCode: input.statusCode,
        success: input.success,
        latencyMs: input.latencyMs,
        estimatedCostMicros: input.estimatedCostMicros,
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      ledgerWritesEnabled = false;
      if (!loggedMissingLedgerTable) {
        loggedMissingLedgerTable = true;
        console.warn('[external-api] disabling ledger writes until ExternalApiCall table is migrated');
      }
      return;
    }
    if (isExternalApiProviderEnumError(error)) {
      disableLedgerWritesForSchemaDrift(
        'ExternalApiProvider enum mismatch; run prisma migrations to include new provider values'
      );
      return;
    }
    // Non-fatal: requests should not fail if telemetry persistence fails.
    console.warn('[external-api] failed to record call ledger row', error);
  }
}

export async function callExternalApi(options: ExternalApiRequest): Promise<Response> {
  const method = options.method ?? 'GET';
  const retries = Math.max(0, options.retries ?? 0);
  const timeoutMs = Math.max(500, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const retryableStatusCodes = options.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES;
  const estimatedCostMicros = Math.max(0, options.estimatedCostMicros ?? 0);

  await assertBudgetAllowsCall(options.provider, options.endpoint, estimatedCostMicros);

  const requestHash = computeRequestHash({
    provider: options.provider,
    endpoint: options.endpoint,
    method,
    url: options.url,
    headers: options.headers,
    body: options.body,
  });

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await fetch(options.url, {
        method,
        headers: options.headers,
        body: options.body,
        cache: 'no-store',
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startedAt;
      const success = response.ok;

      await recordExternalApiCall({
        provider: options.provider,
        endpoint: options.endpoint,
        requestHash,
        statusCode: response.status,
        success,
        latencyMs,
        estimatedCostMicros: success ? estimatedCostMicros : 0,
        context: options.context,
      });

      if (success) return response;

      if (retryableStatusCodes.has(response.status) && attempt < retries) {
        await sleep(backoffDelayMs(attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      const latencyMs = Date.now() - startedAt;

      await recordExternalApiCall({
        provider: options.provider,
        endpoint: options.endpoint,
        requestHash,
        statusCode: null,
        success: false,
        latencyMs,
        estimatedCostMicros: 0,
        context: options.context,
      });

      const isAbort = error instanceof Error && error.name === 'AbortError';
      if (attempt < retries) {
        await sleep(backoffDelayMs(attempt + 1));
        continue;
      }

      if (isAbort) {
        throw new Error(`[external-api] ${options.endpoint} timed out after ${timeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`[external-api] unexpected retry exit for ${options.endpoint}`);
}
