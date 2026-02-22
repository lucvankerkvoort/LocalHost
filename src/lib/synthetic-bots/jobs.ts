import type { SyntheticReplyJob } from '@prisma/client';
import { BookingStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getSyntheticBotsConfig } from '@/lib/synthetic-bots/config';
import { generateSyntheticHostReply } from '@/lib/synthetic-bots/responder';

const CHAT_ELIGIBLE_STATUSES = new Set<BookingStatus>(['TENTATIVE', 'PENDING', 'CONFIRMED', 'COMPLETED']);

export function computeDeterministicLatencySec(
  stableKey: string,
  minLatencySec: number,
  maxLatencySec: number
): number {
  const safeMin = Math.max(0, Math.min(minLatencySec, maxLatencySec));
  const safeMax = Math.max(safeMin, maxLatencySec);
  if (safeMin === safeMax) return safeMin;

  let hash = 0;
  for (let i = 0; i < stableKey.length; i++) {
    hash = (hash * 31 + stableKey.charCodeAt(i)) >>> 0;
  }
  const span = safeMax - safeMin + 1;
  return safeMin + (hash % span);
}

export async function enqueueSyntheticReplyJob(input: {
  bookingId: string;
  hostId: string;
  triggerMessageId: string;
  latencyMinSec?: number | null;
  latencyMaxSec?: number | null;
}) {
  const config = getSyntheticBotsConfig();
  if (!config.enabled) {
    return { enqueued: false, reason: 'SYNTHETIC_BOTS_DISABLED' as const };
  }

  const minLatency = input.latencyMinSec ?? 5;
  const maxLatency = input.latencyMaxSec ?? 30;
  const latencySec = computeDeterministicLatencySec(input.triggerMessageId, minLatency, maxLatency);
  const dueAt = new Date(Date.now() + latencySec * 1000);

  const job = await prisma.syntheticReplyJob.upsert({
    where: {
      bookingId_triggerMessageId: {
        bookingId: input.bookingId,
        triggerMessageId: input.triggerMessageId,
      },
    },
    create: {
      bookingId: input.bookingId,
      hostId: input.hostId,
      triggerMessageId: input.triggerMessageId,
      status: 'PENDING',
      dueAt,
      attemptCount: 0,
    },
    update: {
      dueAt,
      hostId: input.hostId,
      status: 'PENDING',
      error: null,
    },
  });

  return { enqueued: true, reason: 'ENQUEUED' as const, jobId: job.id, dueAt };
}

async function markJobCancelled(jobId: string, error: string) {
  await prisma.syntheticReplyJob.update({
    where: { id: jobId },
    data: {
      status: 'CANCELLED',
      error,
    },
  });
}

async function markJobRetryOrFailed(job: SyntheticReplyJob, error: unknown) {
  const config = getSyntheticBotsConfig();
  const message = error instanceof Error ? error.message : String(error);

  if (job.attemptCount >= config.maxRetries) {
    await prisma.syntheticReplyJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        error: message,
      },
    });
    return;
  }

  const retryDelaySec = Math.min(120, 10 * Math.max(1, job.attemptCount));
  await prisma.syntheticReplyJob.update({
    where: { id: job.id },
    data: {
      status: 'PENDING',
      error: message,
      dueAt: new Date(Date.now() + retryDelaySec * 1000),
    },
  });
}

async function claimDueJobs(limit: number) {
  const candidates = await prisma.syntheticReplyJob.findMany({
    where: {
      status: 'PENDING',
      dueAt: { lte: new Date() },
    },
    orderBy: { dueAt: 'asc' },
    take: limit,
  });

  const claimedIds: string[] = [];
  for (const candidate of candidates) {
    const result = await prisma.syntheticReplyJob.updateMany({
      where: {
        id: candidate.id,
        status: 'PENDING',
      },
      data: {
        status: 'PROCESSING',
        attemptCount: { increment: 1 },
      },
    });
    if (result.count === 1) {
      claimedIds.push(candidate.id);
    }
  }

  if (claimedIds.length === 0) return [];

  return prisma.syntheticReplyJob.findMany({
    where: { id: { in: claimedIds } },
    include: {
      booking: {
        include: {
          experience: true,
          host: true,
        },
      },
      triggerMessage: true,
    },
  });
}

export async function processSyntheticReplyJob(jobId: string) {
  const job = await prisma.syntheticReplyJob.findUnique({
    where: { id: jobId },
    include: {
      booking: {
        include: {
          experience: true,
          host: true,
        },
      },
      triggerMessage: true,
    },
  });

  if (!job) return { status: 'SKIPPED_NOT_FOUND' as const };

  const hostId = job.booking.hostId ?? job.booking.experience.hostId;
  const host = job.booking.host;

  if (!hostId || !host || host.id !== hostId) {
    await markJobCancelled(job.id, 'Host missing for booking');
    return { status: 'CANCELLED' as const };
  }

  if (!CHAT_ELIGIBLE_STATUSES.has(job.booking.status)) {
    await markJobCancelled(job.id, 'Booking is not chat-eligible');
    return { status: 'CANCELLED' as const };
  }

  if (!host.isSyntheticHost || !host.syntheticBotEnabled) {
    await markJobCancelled(job.id, 'Host is not synthetic bot-enabled');
    return { status: 'CANCELLED' as const };
  }

  if (job.triggerMessage.senderId === hostId) {
    await markJobCancelled(job.id, 'No bot-to-bot loops allowed');
    return { status: 'CANCELLED' as const };
  }

  const recentMessages = await prisma.message.findMany({
    where: { bookingId: job.bookingId },
    orderBy: { createdAt: 'desc' },
    take: 8,
  });

  const reply = generateSyntheticHostReply({
    hostName: host.name,
    style: host.syntheticResponseStyle,
    personaKey: host.syntheticPersonaKey,
    guestMessage: job.triggerMessage.content,
    bookingDate: job.booking.date,
    recentMessages: recentMessages.reverse().map((message) => ({
      senderId: message.senderId,
      content: message.content,
    })),
  });

  try {
    await prisma.$transaction([
      prisma.message.create({
        data: {
          bookingId: job.bookingId,
          senderId: hostId,
          content: reply,
        },
      }),
      prisma.syntheticReplyJob.update({
        where: { id: job.id },
        data: {
          status: 'DONE',
          error: null,
        },
      }),
    ]);
  } catch (error) {
    await markJobRetryOrFailed(job, error);
    return { status: 'FAILED' as const };
  }

  return { status: 'DONE' as const };
}

export async function processDueSyntheticReplyJobs(input?: { limit?: number }) {
  const config = getSyntheticBotsConfig();
  if (!config.enabled) {
    return { claimed: 0, done: 0, failed: 0, cancelled: 0 };
  }

  const limit = Math.max(1, input?.limit ?? 10);
  const claimedJobs = await claimDueJobs(limit);
  let done = 0;
  let failed = 0;
  let cancelled = 0;

  for (const job of claimedJobs) {
    const result = await processSyntheticReplyJob(job.id);
    if (result.status === 'DONE') done += 1;
    if (result.status === 'FAILED') failed += 1;
    if (result.status === 'CANCELLED') cancelled += 1;
  }

  return {
    claimed: claimedJobs.length,
    done,
    failed,
    cancelled,
  };
}
