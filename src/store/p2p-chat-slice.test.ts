import assert from 'node:assert/strict';
import test from 'node:test';

import type { RootState } from './store';
import reducer, {
  fetchMessages,
  initThread,
  markThreadAsRead,
  receiveMessage,
  selectActiveThread,
  selectAllThreads,
  selectTotalUnreadCount,
  sendChatMessage,
  setActiveBookingId,
} from './p2p-chat-slice';

function toRoot(state: ReturnType<typeof reducer>): RootState {
  return { p2pChat: state } as unknown as RootState;
}

function getInitialState() {
  return reducer(undefined, { type: '@@INIT' });
}

test('initThread creates thread and sets activeBookingId', () => {
  const state = reducer(
    getInitialState(),
    initThread({
      bookingId: 'b-1',
      hostId: 'h-1',
      hostName: 'Host One',
      hostPhoto: 'photo.jpg',
    })
  );

  assert.equal(state.activeBookingId, 'b-1');
  assert.equal(state.threads['b-1'].hostName, 'Host One');
  assert.equal(state.threads['b-1'].messages.length, 0);
});

test('initThread does not replace existing thread metadata', () => {
  const first = reducer(
    getInitialState(),
    initThread({
      bookingId: 'b-1',
      hostId: 'h-1',
      hostName: 'Original Host',
      hostPhoto: 'first.jpg',
    })
  );
  const second = reducer(
    first,
    initThread({
      bookingId: 'b-1',
      hostId: 'h-2',
      hostName: 'New Host',
      hostPhoto: 'second.jpg',
    })
  );

  assert.equal(second.threads['b-1'].hostId, 'h-1');
  assert.equal(second.threads['b-1'].hostName, 'Original Host');
  assert.equal(second.threads['b-1'].hostPhoto, 'first.jpg');
  assert.equal(second.activeBookingId, 'b-1');
});

test('setActiveBookingId updates active booking selection', () => {
  const state = reducer(getInitialState(), setActiveBookingId('booking-42'));
  assert.equal(state.activeBookingId, 'booking-42');
});

test('receiveMessage appends HOST message and increments unread count', () => {
  const withThread = reducer(
    getInitialState(),
    initThread({
      bookingId: 'b-1',
      hostId: 'h-1',
      hostName: 'Host One',
      hostPhoto: 'photo.jpg',
    })
  );
  const next = reducer(
    withThread,
    receiveMessage({ bookingId: 'b-1', content: 'Welcome!' })
  );

  assert.equal(next.threads['b-1'].messages.length, 1);
  assert.equal(next.threads['b-1'].messages[0].senderType, 'HOST');
  assert.equal(next.threads['b-1'].messages[0].content, 'Welcome!');
  assert.equal(next.threads['b-1'].messages[0].isRead, false);
  assert.equal(next.threads['b-1'].unreadCount, 1);
});

test('receiveMessage is a no-op when booking thread is missing', () => {
  const state = reducer(
    getInitialState(),
    receiveMessage({ bookingId: 'missing', content: 'hello' })
  );
  assert.deepEqual(state.threads, {});
});

test('markThreadAsRead clears unread count and marks HOST messages as read', () => {
  let state = reducer(
    getInitialState(),
    initThread({
      bookingId: 'b-1',
      hostId: 'h-1',
      hostName: 'Host One',
      hostPhoto: 'photo.jpg',
    })
  );
  state = reducer(
    state,
    fetchMessages.fulfilled(
      [
        {
          id: 'm-host',
          content: 'host message',
          createdAt: '2026-01-01T00:00:00.000Z',
          isRead: false,
          senderId: 'h-1',
        },
      ],
      'req-1',
      'b-1'
    )
  );
  state = reducer(
    state,
    sendChatMessage.fulfilled(
      {
        id: 'm-user',
        content: 'user reply',
        createdAt: '2026-01-01T01:00:00.000Z',
      },
      'req-2',
      { bookingId: 'b-1', content: 'user reply' }
    )
  );
  state = reducer(
    state,
    receiveMessage({ bookingId: 'b-1', content: 'new host message' })
  );

  const next = reducer(state, markThreadAsRead({ bookingId: 'b-1' }));
  const [first, second, third] = next.threads['b-1'].messages;

  assert.equal(next.threads['b-1'].unreadCount, 0);
  assert.equal(first.senderType, 'HOST');
  assert.equal(first.isRead, true);
  assert.equal(second.senderType, 'USER');
  assert.equal(second.isRead, true);
  assert.equal(third.senderType, 'HOST');
  assert.equal(third.isRead, true);
});

test('fetchMessages.fulfilled maps API payload into thread messages', () => {
  const withThread = reducer(
    getInitialState(),
    initThread({
      bookingId: 'b-1',
      hostId: 'h-1',
      hostName: 'Host One',
      hostPhoto: 'photo.jpg',
    })
  );
  const next = reducer(
    withThread,
    fetchMessages.fulfilled(
      [
        {
          id: 'm-1',
          content: 'hello',
          createdAt: '2026-01-01T00:00:00.000Z',
          isRead: true,
          senderId: 'h-1',
        },
      ],
      'req-1',
      'b-1'
    )
  );

  assert.deepEqual(next.threads['b-1'].messages, [
    {
      id: 'm-1',
      content: 'hello',
      createdAt: '2026-01-01T00:00:00.000Z',
      isRead: true,
      senderType: 'HOST',
    },
  ]);
});

test('sendChatMessage.fulfilled appends USER message and updates lastMessageAt', () => {
  const withThread = reducer(
    getInitialState(),
    initThread({
      bookingId: 'b-1',
      hostId: 'h-1',
      hostName: 'Host One',
      hostPhoto: 'photo.jpg',
    })
  );
  const next = reducer(
    withThread,
    sendChatMessage.fulfilled(
      {
        id: 'm-2',
        content: 'sent message',
        createdAt: '2026-01-01T10:00:00.000Z',
      },
      'req-2',
      { bookingId: 'b-1', content: 'sent message' }
    )
  );

  const last = next.threads['b-1'].messages[next.threads['b-1'].messages.length - 1];
  assert.equal(last.id, 'm-2');
  assert.equal(last.senderType, 'USER');
  assert.equal(last.isRead, true);
  assert.equal(next.threads['b-1'].lastMessageAt, '2026-01-01T10:00:00.000Z');
});

test('selectAllThreads sorts by latest message timestamp descending', () => {
  let state = getInitialState();
  state = reducer(
    state,
    initThread({
      bookingId: 'old',
      hostId: 'h-1',
      hostName: 'Old',
      hostPhoto: 'old.jpg',
    })
  );
  state = reducer(
    state,
    initThread({
      bookingId: 'new',
      hostId: 'h-2',
      hostName: 'New',
      hostPhoto: 'new.jpg',
    })
  );
  state = reducer(
    state,
    sendChatMessage.fulfilled(
      { id: 'm-old', content: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
      'req-old',
      { bookingId: 'old', content: 'old' }
    )
  );
  state = reducer(
    state,
    sendChatMessage.fulfilled(
      { id: 'm-new', content: 'new', createdAt: '2026-01-02T00:00:00.000Z' },
      'req-new',
      { bookingId: 'new', content: 'new' }
    )
  );

  const sorted = selectAllThreads(toRoot(state));
  assert.deepEqual(
    sorted.map((thread) => thread.bookingId),
    ['new', 'old']
  );
});

test('selectActiveThread returns active thread or null', () => {
  const base = getInitialState();
  assert.equal(selectActiveThread(toRoot(base)), null);

  const withThread = reducer(
    base,
    initThread({
      bookingId: 'b-1',
      hostId: 'h-1',
      hostName: 'Host One',
      hostPhoto: 'photo.jpg',
    })
  );

  assert.equal(selectActiveThread(toRoot(withThread))?.bookingId, 'b-1');
});

test('selectTotalUnreadCount sums unread counts across threads', () => {
  let state = getInitialState();
  state = reducer(
    state,
    initThread({
      bookingId: 'a',
      hostId: 'h-1',
      hostName: 'Host A',
      hostPhoto: 'a.jpg',
    })
  );
  state = reducer(
    state,
    initThread({
      bookingId: 'b',
      hostId: 'h-2',
      hostName: 'Host B',
      hostPhoto: 'b.jpg',
    })
  );
  state = reducer(state, receiveMessage({ bookingId: 'a', content: '1' }));
  state = reducer(state, receiveMessage({ bookingId: 'a', content: '2' }));
  state = reducer(state, receiveMessage({ bookingId: 'b', content: '3' }));

  assert.equal(selectTotalUnreadCount(toRoot(state)), 3);
});
