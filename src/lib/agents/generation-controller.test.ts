import assert from 'node:assert/strict';
import test from 'node:test';

import { GenerationController, type PlannerSnapshot } from './generation-controller';

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

type Snapshot = PlannerSnapshot & {
  destinations?: string[];
};

test('latest wins: replaces pending snapshot while one generation is in flight', async () => {
  const startedRequests: string[] = [];
  let releaseFirst = () => {};
  const blockFirstRun = new Promise<void>((resolve) => {
    releaseFirst = () => resolve();
  });
  let runCount = 0;

  const controller = new GenerationController<Snapshot>({
    refineDebounceMs: 20,
    ensureJobId: ({ existingJobId }) => existingJobId ?? 'job-1',
    runGeneration: async ({ snapshot }) => {
      runCount += 1;
      startedRequests.push(snapshot.request);
      if (runCount === 1) {
        await blockFirstRun;
      }
    },
  });

  await controller.schedule('trip-1', { request: 'A', createdAt: 1 });
  await controller.schedule('trip-1', { request: 'B', createdAt: 2 });
  await controller.schedule('trip-1', { request: 'C', createdAt: 3 });

  const pendingState = controller.getState('trip-1');
  assert.equal(pendingState?.hasPendingSnapshot, true);
  assert.equal(startedRequests.length, 1);
  assert.equal(startedRequests[0], 'A');

  releaseFirst();
  await wait(60);

  assert.deepEqual(startedRequests, ['A', 'C']);
  const settled = controller.getState('trip-1');
  assert.equal(settled?.state, 'IDLE');
  assert.equal(settled?.hasPendingSnapshot, false);
});

test('debounces refinements after initial draft', async () => {
  const startedRequests: string[] = [];

  const controller = new GenerationController<Snapshot>({
    refineDebounceMs: 40,
    ensureJobId: ({ existingJobId }) => existingJobId ?? 'job-1',
    runGeneration: async ({ snapshot }) => {
      startedRequests.push(snapshot.request);
    },
  });

  await controller.schedule('trip-1', { request: 'Draft request', createdAt: 1 });
  await wait(5);

  await controller.schedule('trip-1', { request: 'Refine request', createdAt: 2 });
  await wait(10);
  assert.deepEqual(startedRequests, ['Draft request']);

  await wait(50);
  assert.deepEqual(startedRequests, ['Draft request', 'Refine request']);
});

test('debounce window keeps only the latest snapshot when user types quickly', async () => {
  const startedRequests: string[] = [];

  const controller = new GenerationController<Snapshot>({
    refineDebounceMs: 35,
    ensureJobId: ({ existingJobId }) => existingJobId ?? 'job-1',
    runGeneration: async ({ snapshot }) => {
      startedRequests.push(snapshot.request);
    },
  });

  await controller.schedule('trip-1', { request: 'Draft request', createdAt: 1 });
  await wait(5);

  await controller.schedule('trip-1', { request: 'Refine #1', createdAt: 2 });
  await controller.schedule('trip-1', { request: 'Refine #2', createdAt: 3 });
  await controller.schedule('trip-1', { request: 'Refine #3', createdAt: 4 });

  await wait(60);
  assert.deepEqual(startedRequests, ['Draft request', 'Refine #3']);
});

test('cancel aborts in-flight generation and clears pending work', async () => {
  let wasAborted = false;

  const controller = new GenerationController<Snapshot>({
    refineDebounceMs: 20,
    ensureJobId: ({ existingJobId }) => existingJobId ?? 'job-1',
    runGeneration: async ({ signal }) => {
      await new Promise<void>((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            wasAborted = true;
            resolve();
          },
          { once: true }
        );
      });
    },
  });

  await controller.schedule('trip-1', { request: 'Long running', createdAt: 1 });
  await wait(5);
  controller.cancel('trip-1');
  await wait(5);

  assert.equal(wasAborted, true);
  const state = controller.getState('trip-1');
  assert.equal(state?.state, 'IDLE');
  assert.equal(state?.hasInFlightRequest, false);
  assert.equal(state?.hasPendingSnapshot, false);
});

test('onQueued receives the current generationId while a generation is in flight', async () => {
  let releaseFirst = () => {};
  const blockFirstRun = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const queuedCalls: Array<{ jobId: string; generationId: string | null }> = [];

  const controller = new GenerationController<Snapshot>({
    refineDebounceMs: 20,
    ensureJobId: ({ existingJobId }) => existingJobId ?? 'job-1',
    onQueued: async ({ jobId, generationId }) => {
      queuedCalls.push({ jobId, generationId });
    },
    runGeneration: async ({ signal }) => {
      await new Promise<void>((resolve) => {
        const finish = () => resolve();
        signal.addEventListener('abort', finish, { once: true });
        void blockFirstRun.then(finish);
      });
    },
  });

  await controller.schedule('trip-1', { request: 'Draft request', createdAt: 1 });
  await controller.schedule('trip-1', { request: 'Refine request', createdAt: 2 });

  assert.equal(queuedCalls.length, 1);
  assert.equal(queuedCalls[0]?.jobId, 'job-1');
  assert.equal(typeof queuedCalls[0]?.generationId, 'string');
  assert.ok(queuedCalls[0]?.generationId);

  releaseFirst();
  await wait(40);
});
