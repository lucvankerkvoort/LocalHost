import assert from 'node:assert/strict';
import test from 'node:test';

import type { OrchestratorJobState } from '@/store/orchestrator-slice';
import { deriveOrchestratorProgressUi } from './orchestrator-progress-ui';

function makeJob(overrides: Partial<OrchestratorJobState> = {}): OrchestratorJobState {
  return {
    id: 'job-1',
    status: 'running',
    stage: 'geocoding',
    message: 'Hydrating places',
    startedAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

test('maps known stages to curated labels and stage-band percent', () => {
  const ui = deriveOrchestratorProgressUi(
    makeJob({ stage: 'hosts', current: 1, total: 2, message: 'Hydrating places' })
  );

  assert.equal(ui.label, 'Looking for places to stay...');
  assert.equal(ui.indeterminate, false);
  assert.equal(ui.percent, 78);
});

test('uses indeterminate mode when counters are missing', () => {
  const ui = deriveOrchestratorProgressUi(makeJob({ stage: 'routing', current: undefined }));

  assert.equal(ui.label, 'Calculating routes...');
  assert.equal(ui.indeterminate, true);
  assert.equal(ui.percent, 45);
});

test('progress is monotonic when backend counters reset or regress', () => {
  const initial = deriveOrchestratorProgressUi(
    makeJob({ stage: 'hosts', current: 4, total: 5 }),
    null
  );
  const regressed = deriveOrchestratorProgressUi(
    makeJob({ stage: 'geocoding', current: 1, total: 10 }),
    initial.percent
  );

  assert.equal(initial.percent, 85);
  assert.equal(regressed.indeterminate, false);
  assert.equal(regressed.percent, 85);
});

test('complete state always returns 100 percent', () => {
  const ui = deriveOrchestratorProgressUi(makeJob({ status: 'complete', stage: 'complete' }), 92);

  assert.equal(ui.label, 'Trip plan ready');
  assert.equal(ui.indeterminate, false);
  assert.equal(ui.percent, 100);
});

test('error state keeps last shown percent when available', () => {
  const ui = deriveOrchestratorProgressUi(
    makeJob({ status: 'error', stage: 'error', error: 'Boom' }),
    67
  );

  assert.equal(ui.label, 'Planner hit an error');
  assert.equal(ui.indeterminate, false);
  assert.equal(ui.percent, 67);
});

