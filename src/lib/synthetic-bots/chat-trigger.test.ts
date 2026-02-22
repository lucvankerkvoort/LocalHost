import assert from 'node:assert/strict';
import test from 'node:test';

import type { BookingForSyntheticReplyTrigger } from './chat-trigger';
import { maybeEnqueueSyntheticReplyForMessage, resolveBookingHostId } from './chat-trigger';

function makeBooking(overrides: Partial<BookingForSyntheticReplyTrigger> = {}): BookingForSyntheticReplyTrigger {
  return {
    id: 'booking-1',
    hostId: 'host-1',
    status: 'CONFIRMED',
    experience: { hostId: 'host-1' },
    host: {
      id: 'host-1',
      isSyntheticHost: true,
      syntheticBotEnabled: true,
      syntheticResponseLatencyMinSec: 5,
      syntheticResponseLatencyMaxSec: 20,
    },
    ...overrides,
  };
}

test('resolveBookingHostId prefers denormalized hostId when available', () => {
  const booking = makeBooking({ hostId: 'host-denorm', experience: { hostId: 'host-exp' } });
  assert.equal(resolveBookingHostId(booking), 'host-denorm');
});

test('resolveBookingHostId falls back to experience host when hostId missing', () => {
  const booking = makeBooking({ hostId: null, experience: { hostId: 'host-exp' } });
  assert.equal(resolveBookingHostId(booking), 'host-exp');
});

test('maybeEnqueueSyntheticReplyForMessage enqueues for synthetic host guest message', async () => {
  let enqueueCalled = false;
  const result = await maybeEnqueueSyntheticReplyForMessage({
    booking: makeBooking(),
    senderId: 'guest-1',
    triggerMessageId: 'msg-1',
    enqueueJob: async () => {
      enqueueCalled = true;
      return { enqueued: true, reason: 'ENQUEUED', jobId: 'job-1', dueAt: new Date() };
    },
  });

  assert.equal(enqueueCalled, true);
  assert.equal(result.enqueued, true);
});

test('maybeEnqueueSyntheticReplyForMessage skips when sender is host', async () => {
  const result = await maybeEnqueueSyntheticReplyForMessage({
    booking: makeBooking(),
    senderId: 'host-1',
    triggerMessageId: 'msg-1',
  });

  assert.equal(result.enqueued, false);
  assert.equal(result.reason, 'SENDER_IS_HOST');
});

test('maybeEnqueueSyntheticReplyForMessage skips for cancelled booking', async () => {
  const result = await maybeEnqueueSyntheticReplyForMessage({
    booking: makeBooking({ status: 'CANCELLED' }),
    senderId: 'guest-1',
    triggerMessageId: 'msg-1',
  });

  assert.equal(result.enqueued, false);
  assert.equal(result.reason, 'BOOKING_NOT_CHAT_ELIGIBLE');
});

test('maybeEnqueueSyntheticReplyForMessage skips when host is not synthetic-enabled', async () => {
  const result = await maybeEnqueueSyntheticReplyForMessage({
    booking: makeBooking({
      host: {
        id: 'host-1',
        isSyntheticHost: false,
        syntheticBotEnabled: false,
        syntheticResponseLatencyMinSec: 5,
        syntheticResponseLatencyMaxSec: 20,
      },
    }),
    senderId: 'guest-1',
    triggerMessageId: 'msg-1',
  });

  assert.equal(result.enqueued, false);
  assert.equal(result.reason, 'HOST_NOT_SYNTHETIC_ENABLED');
});
