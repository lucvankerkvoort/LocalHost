import Redis from 'ioredis';

let _client: Redis | null = null;

/**
 * Returns a shared Redis client, or null if REDIS_URL is not configured.
 * All Redis calls should degrade gracefully when null is returned.
 */
export function getRedisClient(): Redis | null {
  if (_client) return _client;

  const url = process.env.REDIS_URL;
  if (!url) {
    return null;
  }

  try {
    _client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    _client.on('error', (err: Error) => {
      console.warn('[Redis] Connection error:', err.message);
    });

    return _client;
  } catch (err) {
    console.warn('[Redis] Failed to initialise client:', err);
    return null;
  }
}

/** Exposed for tests that need to reset the singleton. */
export function _resetRedisClient(): void {
  if (_client) {
    _client.disconnect();
    _client = null;
  }
}
