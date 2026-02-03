import assert from 'node:assert/strict';
import test from 'node:test';

import reducer, {
  clearJobs,
  jobCompleted,
  jobFailed,
  jobProgress,
  jobStarted,
} from './orchestrator-slice';

function getInitialState() {
  return reducer(undefined, { type: '@@INIT' });
}

test('jobStarted creates a draft job and sets activeJobId', () => {
  const state = reducer(
    getInitialState(),
    jobStarted({ id: 'job-1', stage: 'draft', message: 'Starting', current: 0, total: 3 })
  );

  assert.equal(state.activeJobId, 'job-1');
  assert.equal(state.jobs['job-1'].status, 'draft');
  assert.equal(state.jobs['job-1'].stage, 'draft');
  assert.equal(state.jobs['job-1'].message, 'Starting');
  assert.equal(state.jobs['job-1'].current, 0);
  assert.equal(state.jobs['job-1'].total, 3);
  assert.ok(state.jobs['job-1'].startedAt > 0);
  assert.ok(state.jobs['job-1'].updatedAt > 0);
});

test('jobProgress updates existing job to running', () => {
  const started = reducer(
    getInitialState(),
    jobStarted({ id: 'job-1', stage: 'draft', message: 'Starting' })
  );
  const progressed = reducer(
    started,
    jobProgress({ id: 'job-1', stage: 'routing', message: 'Routing', current: 2, total: 5 })
  );

  assert.equal(progressed.jobs['job-1'].status, 'running');
  assert.equal(progressed.jobs['job-1'].stage, 'routing');
  assert.equal(progressed.jobs['job-1'].message, 'Routing');
  assert.equal(progressed.jobs['job-1'].current, 2);
  assert.equal(progressed.jobs['job-1'].total, 5);
});

test('jobProgress is a no-op for unknown id', () => {
  const state = reducer(
    getInitialState(),
    jobProgress({ id: 'missing', stage: 'routing', message: 'No-op' })
  );

  assert.deepEqual(state.jobs, {});
  assert.equal(state.activeJobId, null);
});

test('jobCompleted marks job complete and clears active job', () => {
  const started = reducer(
    getInitialState(),
    jobStarted({ id: 'job-1', stage: 'draft', message: 'Starting' })
  );
  const completed = reducer(started, jobCompleted({ id: 'job-1' }));

  assert.equal(completed.jobs['job-1'].status, 'complete');
  assert.equal(completed.jobs['job-1'].stage, 'complete');
  assert.equal(completed.jobs['job-1'].message, 'Plan ready');
  assert.equal(completed.activeJobId, null);
});

test('jobFailed marks job error, stores error text, and clears active job', () => {
  const started = reducer(
    getInitialState(),
    jobStarted({ id: 'job-1', stage: 'draft', message: 'Starting' })
  );
  const failed = reducer(started, jobFailed({ id: 'job-1', error: 'Tool failed' }));

  assert.equal(failed.jobs['job-1'].status, 'error');
  assert.equal(failed.jobs['job-1'].stage, 'error');
  assert.equal(failed.jobs['job-1'].message, 'Tool failed');
  assert.equal(failed.jobs['job-1'].error, 'Tool failed');
  assert.equal(failed.activeJobId, null);
});

test('clearJobs resets orchestrator state', () => {
  const started = reducer(
    getInitialState(),
    jobStarted({ id: 'job-1', stage: 'draft', message: 'Starting' })
  );
  const cleared = reducer(started, clearJobs());

  assert.equal(cleared.activeJobId, null);
  assert.deepEqual(cleared.jobs, {});
});

test('jobFailed is a no-op for unknown id', () => {
  const state = reducer(
    getInitialState(),
    jobFailed({ id: 'missing', error: 'No job' })
  );

  assert.deepEqual(state.jobs, {});
  assert.equal(state.activeJobId, null);
});
