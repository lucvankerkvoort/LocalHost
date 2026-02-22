import type { BookingStatus } from '@prisma/client';

type HostSyntheticFields = {
  id: string;
  isSyntheticHost: boolean;
  syntheticBotEnabled: boolean;
  syntheticResponseLatencyMinSec: number | null;
  syntheticResponseLatencyMaxSec: number | null;
};

export type BookingForSyntheticReplyTrigger = {
  id: string;
  hostId: string | null;
  status: BookingStatus;
  experience: { hostId: string };
  host?: HostSyntheticFields | null;
};

export function isChatEligibleStatus(status: BookingStatus): boolean {
  return (
    status === 'TENTATIVE' ||
    status === 'PENDING' ||
    status === 'CONFIRMED' ||
    status === 'COMPLETED'
  );
}

export function resolveBookingHostId(booking: BookingForSyntheticReplyTrigger): string {
  return booking.hostId ?? booking.experience.hostId;
}

export async function maybeEnqueueSyntheticReplyForMessage(input: {
  booking: BookingForSyntheticReplyTrigger;
  senderId: string;
  triggerMessageId: string;
  findHostById?: (hostId: string) => Promise<HostSyntheticFields | null>;
  enqueueJob?: (args: {
    bookingId: string;
    hostId: string;
    triggerMessageId: string;
    latencyMinSec?: number | null;
    latencyMaxSec?: number | null;
  }) => Promise<{ enqueued: boolean; reason: 'SYNTHETIC_BOTS_DISABLED' | 'ENQUEUED'; jobId?: string }>;
}) {
  const hostId = resolveBookingHostId(input.booking);
  if (input.senderId === hostId) {
    return { enqueued: false as const, reason: 'SENDER_IS_HOST' as const };
  }

  if (!isChatEligibleStatus(input.booking.status)) {
    return { enqueued: false as const, reason: 'BOOKING_NOT_CHAT_ELIGIBLE' as const };
  }

  const findHostById =
    input.findHostById ??
    (async (hostLookupId: string) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.user.findUnique({
        where: { id: hostLookupId },
        select: {
          id: true,
          isSyntheticHost: true,
          syntheticBotEnabled: true,
          syntheticResponseLatencyMinSec: true,
          syntheticResponseLatencyMaxSec: true,
        },
      });
    });

  const host = input.booking.host?.id === hostId ? input.booking.host : await findHostById(hostId);
  if (!host || !host.isSyntheticHost || !host.syntheticBotEnabled) {
    return { enqueued: false as const, reason: 'HOST_NOT_SYNTHETIC_ENABLED' as const };
  }

  const enqueue =
    input.enqueueJob ??
    (async (args: {
      bookingId: string;
      hostId: string;
      triggerMessageId: string;
      latencyMinSec?: number | null;
      latencyMaxSec?: number | null;
    }) => {
      const jobsModule = await import('@/lib/synthetic-bots/jobs');
      return jobsModule.enqueueSyntheticReplyJob(args);
    });
  const result = await enqueue({
    bookingId: input.booking.id,
    hostId,
    triggerMessageId: input.triggerMessageId,
    latencyMinSec: host.syntheticResponseLatencyMinSec,
    latencyMaxSec: host.syntheticResponseLatencyMaxSec,
  });

  if (!result.enqueued) {
    return { enqueued: false as const, reason: 'ENQUEUE_SKIPPED' as const };
  }

  return { enqueued: true as const, reason: 'ENQUEUED' as const, jobId: result.jobId };
}
