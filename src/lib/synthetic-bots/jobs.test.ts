import assert from 'node:assert/strict';
import test from 'node:test';

type UpsertArgs = {
  where: {
    bookingId_triggerMessageId: {
      bookingId: string;
      triggerMessageId: string;
    };
  };
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};

type PrismaMock = {
  syntheticReplyJob: {
    upsert: (args: UpsertArgs) => Promise<{ id: string }>;
    findMany: (...args: unknown[]) => Promise<unknown[]>;
    updateMany: (...args: unknown[]) => Promise<{ count: number }>;
    findUnique: (...args: unknown[]) => Promise<unknown | null>;
    update: (...args: unknown[]) => Promise<unknown>;
  };
  message: {
    findMany: (...args: unknown[]) => Promise<unknown[]>;
    create: (...args: unknown[]) => Promise<unknown>;
  };
  $transaction: (actions: unknown[]) => Promise<unknown[]>;
};

const globalForPrisma = globalThis as { prisma?: PrismaMock };

let upsertCalls: UpsertArgs[] = [];
let messageCreateCalls: unknown[] = [];
let jobUpdateCalls: unknown[] = [];

let upsertImpl: PrismaMock['syntheticReplyJob']['upsert'] = async (args) => {
  upsertCalls.push(args);
  return { id: 'job-1' };
};

const findManyImpl: PrismaMock['syntheticReplyJob']['findMany'] = async () => [];
const updateManyImpl: PrismaMock['syntheticReplyJob']['updateMany'] = async () => ({ count: 0 });
let findUniqueImpl: PrismaMock['syntheticReplyJob']['findUnique'] = async () => null;
let updateImpl: PrismaMock['syntheticReplyJob']['update'] = async (args) => {
  jobUpdateCalls.push(args);
  return {};
};

let messageFindManyImpl: PrismaMock['message']['findMany'] = async () => [];
let messageCreateImpl: PrismaMock['message']['create'] = async (args) => {
  messageCreateCalls.push(args);
  return {};
};

const prismaMock: PrismaMock = {
  syntheticReplyJob: {
    upsert: async (args) => upsertImpl(args),
    findMany: async (...args) => findManyImpl(...args),
    updateMany: async (...args) => updateManyImpl(...args),
    findUnique: async (...args) => findUniqueImpl(...args),
    update: async (...args) => updateImpl(...args),
  },
  message: {
    findMany: async (...args) => messageFindManyImpl(...args),
    create: async (...args) => messageCreateImpl(...args),
  },
  $transaction: async (actions) => actions,
};

globalForPrisma.prisma = prismaMock;

let cachedModule: Awaited<typeof import('./jobs')> | null = null;
async function getJobsModule() {
  if (!cachedModule) {
    cachedModule = await import('./jobs');
  }
  return cachedModule;
}

test('computeDeterministicLatencySec is deterministic and bounded', { concurrency: false }, async () => {
  const { computeDeterministicLatencySec } = await getJobsModule();
  const first = computeDeterministicLatencySec('msg-1', 5, 25);
  const second = computeDeterministicLatencySec('msg-1', 5, 25);
  const third = computeDeterministicLatencySec('msg-2', 5, 25);

  assert.equal(first, second);
  assert.ok(first >= 5 && first <= 25);
  assert.ok(third >= 5 && third <= 25);
});

test('enqueueSyntheticReplyJob uses composite dedupe key', { concurrency: false }, async () => {
  process.env.SYNTHETIC_BOTS_ENABLED = 'true';
  upsertCalls = [];
  upsertImpl = async (args) => {
    upsertCalls.push(args);
    return { id: 'job-1' };
  };

  const { enqueueSyntheticReplyJob } = await getJobsModule();
  const result = await enqueueSyntheticReplyJob({
    bookingId: 'booking-1',
    hostId: 'host-1',
    triggerMessageId: 'message-1',
    latencyMinSec: 3,
    latencyMaxSec: 7,
  });

  assert.equal(result.enqueued, true);
  assert.equal(upsertCalls.length, 1);
  assert.deepEqual(upsertCalls[0]?.where.bookingId_triggerMessageId, {
    bookingId: 'booking-1',
    triggerMessageId: 'message-1',
  });
});

test('enqueueSyntheticReplyJob skips work when feature is disabled', { concurrency: false }, async () => {
  process.env.SYNTHETIC_BOTS_ENABLED = 'false';
  upsertCalls = [];

  const { enqueueSyntheticReplyJob } = await getJobsModule();
  const result = await enqueueSyntheticReplyJob({
    bookingId: 'booking-2',
    hostId: 'host-2',
    triggerMessageId: 'message-2',
  });

  assert.equal(result.enqueued, false);
  assert.equal(upsertCalls.length, 0);
});

test('processSyntheticReplyJob writes host reply and marks job done', { concurrency: false }, async () => {
  process.env.SYNTHETIC_BOTS_ENABLED = 'true';
  messageCreateCalls = [];
  jobUpdateCalls = [];

  findUniqueImpl = async () =>
    ({
      id: 'job-1',
      bookingId: 'booking-1',
      attemptCount: 1,
      booking: {
        id: 'booking-1',
        hostId: 'host-1',
        status: 'CONFIRMED',
        date: new Date('2026-04-01T00:00:00.000Z'),
        experience: { hostId: 'host-1' },
        host: {
          id: 'host-1',
          name: 'Synthetic Host',
          isSyntheticHost: true,
          syntheticBotEnabled: true,
          syntheticPersonaKey: 'persona',
          syntheticResponseStyle: 'FRIENDLY',
          syntheticResponseLatencyMinSec: 5,
          syntheticResponseLatencyMaxSec: 20,
        },
      },
      triggerMessage: {
        id: 'msg-guest',
        senderId: 'guest-1',
        content: 'What time should we arrive?',
      },
    }) as unknown;

  messageFindManyImpl = async () =>
    [
      {
        senderId: 'guest-1',
        content: 'What time should we arrive?',
      },
    ] as unknown[];

  messageCreateImpl = async (args) => {
    messageCreateCalls.push(args);
    return {};
  };

  updateImpl = async (args) => {
    jobUpdateCalls.push(args);
    return {};
  };

  const { processSyntheticReplyJob } = await getJobsModule();
  const result = await processSyntheticReplyJob('job-1');

  assert.equal(result.status, 'DONE');
  assert.equal(messageCreateCalls.length, 1);
  assert.equal(jobUpdateCalls.length, 1);
});
