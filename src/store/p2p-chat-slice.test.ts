import assert from 'node:assert/strict';
import test from 'node:test';

import type { RootState } from './store';
import reducer, {
  fetchChatThreads,
  fetchMessages,
  initThread,
  markThreadAsRead,
  receiveMessage,
  selectActiveThread,
  selectAllThreads,
  selectTotalUnreadCount,
  sendChatMessage,
  setActiveThreadId,
} from './p2p-chat-slice';

function toRoot(state: ReturnType<typeof reducer>): RootState {
  return { p2pChat: state } as unknown as RootState;
}

function getInitialState() {
  return reducer(undefined, { type: '@@INIT' });
}

test('initThread creates thread and sets activeThreadId', () => {
  const state = reducer(
    getInitialState(),
    initThread({
      threadId: 't-1',
      hostId: 'h-1',
      hostName: 'Host One',
      hostPhoto: 'photo.jpg',
    })
  );

  assert.equal(state.activeThreadId, 't-1');
  assert.equal(state.threads['t-1'].hostName, 'Host One');
  assert.equal(state.threads['t-1'].messages.length, 0);
});

test('fetchChatThreads.fulfilled seeds thread metadata with latest message preview', () => {
  const state = reducer(
    getInitialState(),
    fetchChatThreads.fulfilled(
      [
        {
          id: 't-1',
          bookingId: null,
          counterpartId: 'h-1',
          counterpartName: 'Host One',
          counterpartPhoto: 'photo.jpg',
          latestMessage: {
            id: 'm-1',
            senderId: 'h-1',
            content: 'hello there',
            createdAt: '2026-01-01T00:00:00.000Z',
            isRead: false,
          },
        },
      ],
      'req-threads',
      undefined
    )
  );

  assert.equal(state.threads['t-1'].hostId, 'h-1');
  assert.equal(state.threads['t-1'].hostName, 'Host One');
  assert.equal(state.threads['t-1'].messages.length, 1);
  assert.equal(state.threads['t-1'].messages[0].senderType, 'HOST');
  assert.equal(state.threads['t-1'].messages[0].content, 'hello there');
});

test('initThread does not replace existing thread metadata', () => {
  const first = reducer(
    getInitialState(),
    initThread({
      threadId: 't-1',
      hostId: 'h-1',
      hostName: 'Original Host',
      hostPhoto: 'first.jpg',
    })
  );
  const second = reducer(
    first,
    initThread({
      threadId: 't-1',
      hostId: 'h-2',
      hostName: 'New Host',
      hostPhoto: 'second.jpg',
    })
  );

  assert.equal(second.threads['t-1'].hostId, 'h-1');
  assert.equal(second.threads['t-1'].hostName, 'Original Host');
  assert.equal(second.threads['t-1'].hostPhoto, 'first.jpg');
  assert.equal(second.activeThreadId, 't-1');
});

test('setActiveThreadId updates active thread selection', () => {
  const state = reducer(getInitialState(), setActiveThreadId('thread-42'));
  assert.equal(state.activeThreadId, 'thread-42');
});

test('receiveMessage appends HOST message and increments unread count', () => {
  const withThread = reducer(
    getInitialState(),
    initThread({
      threadId: 't-1',
      hostId: 'h-1',
      hostName: 'Host One',
      hostPhoto: 'photo.jpg',
    })
  );
  const next = reducer(
    withThread,
    receiveMessage({ threadId: 't-1', content: 'Welcome!' })
  );

  assert.equal(next.threads['t-1'].messages.length, 1);
  assert.equal(next.threads['t-1'].messages[0].senderType, 'HOST');
  assert.equal(next.threads['t-1'].messages[0].content, 'Welcome!');
  assert.equal(next.threads['t-1'].messages[0].isRead, false);
  assert.equal(next.threads['t-1'].unreadCount, 1);
});

test('receiveMessage is a no-op when thread is missing', () => {
  const state = reducer(
    getInitialState(),
    receiveMessage({ threadId: 'missing', content: 'hello' })
  );
  assert.deepEqual(state.threads, {});
});

test('markThreadAsRead clears unread count and marks HOST messages as read', () => {
  let state = reducer(
    getInitialState(),
    initThread({
      threadId: 't-1',
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
      't-1'
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
      { threadId: 't-1', content: 'user reply' }
    )
  );
  state = reducer(
    state,
    receiveMessage({ threadId: 't-1', content: 'new host message' })
  );

  const next = reducer(state, markThreadAsRead({ threadId: 't-1' }));
  const [first, second, third] = next.threads['t-1'].messages;

  assert.equal(next.threads['t-1'].unreadCount, 0);
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
      threadId: 't-1',
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
      't-1'
    )
  );

  assert.deepEqual(next.threads['t-1'].messages, [
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
      threadId: 't-1',
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
      { threadId: 't-1', content: 'sent message' }
    )
  );

  const last = next.threads['t-1'].messages[next.threads['t-1'].messages.length - 1];
  assert.equal(last.id, 'm-2');
  assert.equal(last.senderType, 'USER');
  assert.equal(last.isRead, true);
  assert.equal(next.threads['t-1'].lastMessageAt, '2026-01-01T10:00:00.000Z');
});

test('selectAllThreads sorts by latest message timestamp descending', () => {
  let state = getInitialState();
  state = reducer(
    state,
    initThread({
      threadId: 'old',
      hostId: 'h-1',
      hostName: 'Old',
      hostPhoto: 'old.jpg',
    })
  );
  state = reducer(
    state,
    initThread({
      threadId: 'new',
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
      { threadId: 'old', content: 'old' }
    )
  );
  state = reducer(
    state,
    sendChatMessage.fulfilled(
      { id: 'm-new', content: 'new', createdAt: '2026-01-02T00:00:00.000Z' },
      'req-new',
      { threadId: 'new', content: 'new' }
    )
  );

  const sorted = selectAllThreads(toRoot(state));
  assert.deepEqual(
    sorted.map((thread) => thread.threadId),
    ['new', 'old']
  );
});

test('selectActiveThread returns active thread or null', () => {
  const base = getInitialState();
  assert.equal(selectActiveThread(toRoot(base)), null);

  const withThread = reducer(
    base,
    initThread({
      threadId: 't-1',
      hostId: 'h-1',
      hostName: 'Host One',
      hostPhoto: 'photo.jpg',
    })
  );

  assert.equal(selectActiveThread(toRoot(withThread))?.threadId, 't-1');
});

test('selectTotalUnreadCount sums unread counts across threads', () => {
  let state = getInitialState();
  state = reducer(
    state,
    initThread({
      threadId: 'a',
      hostId: 'h-1',
      hostName: 'Host A',
      hostPhoto: 'a.jpg',
    })
  );
  state = reducer(
    state,
    initThread({
      threadId: 'b',
      hostId: 'h-2',
      hostName: 'Host B',
      hostPhoto: 'b.jpg',
    })
  );
  state = reducer(state, receiveMessage({ threadId: 'a', content: '1' }));
  state = reducer(state, receiveMessage({ threadId: 'a', content: '2' }));
  state = reducer(state, receiveMessage({ threadId: 'b', content: '3' }));

  assert.equal(selectTotalUnreadCount(toRoot(state)), 3);
});
