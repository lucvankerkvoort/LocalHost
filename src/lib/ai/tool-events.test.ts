import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppDispatch } from '@/store/store';
import { ingestToolInvocations, ingestToolParts } from './tool-events';

function createDispatchCollector() {
  const actions: Array<{ payload?: { result?: unknown; toolName?: string } }> = [];
  const dispatch = ((action: { payload?: { result?: unknown; toolName?: string } }) => {
    actions.push(action);
    return action;
  }) as unknown as AppDispatch;
  return { dispatch, actions };
}

test('ingestToolInvocations attaches context tripId for updateItinerary results', () => {
  const { dispatch, actions } = createDispatchCollector();

  ingestToolInvocations(
    dispatch,
    [
      {
        toolName: 'updateItinerary',
        state: 'result',
        result: { success: true, updated: true },
      },
    ],
    'chat',
    { tripId: 'trip-123' }
  );

  assert.equal(actions.length, 1);
  const payload = actions[0].payload;
  assert.equal(payload?.toolName, 'updateItinerary');
  assert.deepEqual(payload?.result, {
    success: true,
    updated: true,
    tripId: 'trip-123',
  });
});

test('ingestToolInvocations preserves explicit tripId in result payload', () => {
  const { dispatch, actions } = createDispatchCollector();

  ingestToolInvocations(
    dispatch,
    [
      {
        toolName: 'updateItinerary',
        state: 'result',
        result: { success: true, updated: true, tripId: 'trip-existing' },
      },
    ],
    'chat',
    { tripId: 'trip-context' }
  );

  assert.equal(actions.length, 1);
  const payload = actions[0].payload;
  assert.deepEqual(payload?.result, {
    success: true,
    updated: true,
    tripId: 'trip-existing',
  });
});

test('ingestToolParts attaches context tripId for generateItinerary outputs', () => {
  const { dispatch, actions } = createDispatchCollector();

  ingestToolParts(
    dispatch,
    [
      {
        type: 'tool-generateItinerary',
        toolCallId: 'call-1',
        state: 'output-available',
        output: { success: true, jobId: 'job-1' },
      },
    ],
    'chat',
    new Set<string>(),
    { tripId: 'trip-789' }
  );

  assert.equal(actions.length, 1);
  const payload = actions[0].payload;
  assert.equal(payload?.toolName, 'generateItinerary');
  assert.deepEqual(payload?.result, {
    success: true,
    jobId: 'job-1',
    tripId: 'trip-789',
  });
});
