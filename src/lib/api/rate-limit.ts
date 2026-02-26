/**
 * DB-backed rate limiter for API routes.
 *
 * Uses the `RateLimitEntry` Prisma model with sliding-window counters.
 * Survives serverless cold starts and works across multiple instances.
 *
 * Usage:
 *   import { rateLimit } from '@/lib/api/rate-limit';
 *
 *   const limiter = rateLimit({ interval: 60_000, limit: 10 });
 *
 *   export async function POST(req: Request) {
 *     const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1';
 *     const { success } = await limiter.check(ip);
 *     if (!success) return new Response('Too Many Requests', { status: 429 });
 *     ...
 *   }
 */

import { prisma } from '@/lib/prisma';

interface RateLimitConfig {
  /** A unique prefix for this limiter instance (e.g. "chat", "orchestrator") */
  prefix?: string;
  /** Window duration in milliseconds (default: 60 000 = 1 minute) */
  interval?: number;
  /** Max requests per window (default: 10) */
  limit?: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Compute a deterministic window key from the prefix, identifier, and interval.
 * E.g. "chat:192.168.1.1:1740000" — one bucket per interval.
 */
function computeWindowKey(prefix: string, identifier: string, interval: number): string {
  const windowStart = Math.floor(Date.now() / interval) * interval;
  return `${prefix}:${identifier}:${windowStart}`;
}

export function rateLimit(config: RateLimitConfig = {}) {
  const prefix = config.prefix ?? 'rl';
  const interval = config.interval ?? 60_000;
  const limit = config.limit ?? 10;

  return {
    async check(identifier: string): Promise<RateLimitResult> {
      const now = Date.now();
      const windowKey = computeWindowKey(prefix, identifier, interval);
      const windowStart = Math.floor(now / interval) * interval;
      const resetAt = windowStart + interval;
      const expiresAt = new Date(resetAt);

      try {
        // Upsert: create or increment the counter for this window
        const entry = await prisma.rateLimitEntry.upsert({
          where: {
            identifier_windowKey: { identifier, windowKey },
          },
          create: {
            identifier,
            windowKey,
            count: 1,
            expiresAt,
          },
          update: {
            count: { increment: 1 },
          },
        });

        const success = entry.count <= limit;
        return {
          success,
          remaining: Math.max(0, limit - entry.count),
          resetAt,
        };
      } catch {
        // On DB error, fail open (allow the request)
        return { success: true, remaining: limit, resetAt };
      }
    },
  };
}

/**
 * Cleanup expired rate limit entries. Call periodically (e.g. via cron)
 * or let the DB grow and clean up manually.
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  const result = await prisma.rateLimitEntry.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
