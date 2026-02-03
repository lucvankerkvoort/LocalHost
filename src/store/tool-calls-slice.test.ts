import assert from 'node:assert/strict';
import test from 'node:test';

import reducer, {
  clearToolEvents,
  navigationHandled,
  toolCallReceived,
} from './tool-calls-slice';

function getInitialState() {
  return reducer(undefined, { type: '@@INIT' });
}

test('toolCallReceived stores event and latestByTool', () => {
  const action = toolCallReceived({
    toolName: 'search',
    state: 'call',
    source: 'chat',
  });
  const state = reducer(getInitialState(), action);

  assert.equal(state.events.length, 1);
  assert.equal(state.latestByTool.search.id, action.payload.id);
  assert.equal(state.latestByTool.search.state, 'call');
});

test('toolCallReceived stores result events in lastResultsByTool', () => {
  const action = toolCallReceived({
    toolName: 'search',
    state: 'result',
    result: { success: true },
    source: 'chat',
  });
  const state = reducer(getInitialState(), action);

  assert.equal(state.lastResultsByTool.search.id, action.payload.id);
  assert.equal(state.lastResultsByTool.search.state, 'result');
  assert.equal(state.lastResultsByTool.search.success, true);
});

test('toolCallReceived infers success from result.success and falls back to payload.success', () => {
  const inferred = toolCallReceived({
    toolName: 'resolve',
    state: 'result',
    result: { success: false },
    success: true,
    source: 'chat',
  });
  const fallback = toolCallReceived({
    toolName: 'other',
    state: 'result',
    result: { value: 1 },
    success: true,
    source: 'chat',
  });

  assert.equal(inferred.payload.success, false);
  assert.equal(fallback.payload.success, true);
});

test('navigate result sets pendingNavigation', () => {
  const action = toolCallReceived({
    toolName: 'navigate',
    state: 'result',
    result: { url: '/trips/abc' },
    source: 'chat',
  });
  const state = reducer(getInitialState(), action);

  assert.deepEqual(state.pendingNavigation, {
    url: '/trips/abc',
    toolId: action.payload.id,
  });
});

test('navigationHandled clears pending navigation only for matching tool id', () => {
  const action = toolCallReceived({
    toolName: 'navigate',
    state: 'result',
    result: { url: '/trips/abc' },
    source: 'chat',
  });
  const withPending = reducer(getInitialState(), action);

  const wrongIdState = reducer(withPending, navigationHandled('wrong-id'));
  assert.deepEqual(wrongIdState.pendingNavigation, withPending.pendingNavigation);

  const cleared = reducer(withPending, navigationHandled(action.payload.id));
  assert.equal(cleared.pendingNavigation, null);
});

test('toolCallReceived keeps at most 200 events', () => {
  let state = getInitialState();
  const first = toolCallReceived({
    toolName: 'tool',
    state: 'call',
    source: 'chat',
    timestamp: 1000,
  });
  state = reducer(state, first);

  for (let i = 1; i <= 205; i++) {
    state = reducer(
      state,
      toolCallReceived({
        toolName: 'tool',
        state: 'call',
        source: 'chat',
        timestamp: 1000 + i,
      })
    );
  }

  assert.equal(state.events.length, 200);
  assert.notEqual(state.events[0].id, first.payload.id);
});

test('clearToolEvents resets events, indexes and pendingNavigation', () => {
  const action = toolCallReceived({
    toolName: 'navigate',
    state: 'result',
    result: { url: '/x' },
    source: 'chat',
  });
  const withData = reducer(getInitialState(), action);
  const cleared = reducer(withData, clearToolEvents());

  assert.deepEqual(cleared.events, []);
  assert.deepEqual(cleared.latestByTool, {});
  assert.deepEqual(cleared.lastResultsByTool, {});
  assert.equal(cleared.pendingNavigation, null);
});
