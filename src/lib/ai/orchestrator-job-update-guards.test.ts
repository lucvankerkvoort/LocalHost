import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAtomicOrchestratorJobUpdateWhere,
  classifyOrchestratorJobUpdateRejectReason,
} from './orchestrator-job-update-guards';

test('buildAtomicOrchestratorJobUpdateWhere adds terminal-state protection for non-terminal writes', () => {
  const where = buildAtomicOrchestratorJobUpdateWhere({
    id: 'job-1',
    expectedGenerationId: 'gen-1',
    nextStatus: 'running',
  });

  assert.deepEqual(where, {
    id: 'job-1',
    OR: [{ generationId: 'gen-1' }, { generationId: null }],
    NOT: { status: { in: ['complete', 'error'] } },
  });
});

test('buildAtomicOrchestratorJobUpdateWhere omits terminal-state protection for terminal writes', () => {
  const where = buildAtomicOrchestratorJobUpdateWhere({
    id: 'job-1',
    expectedGenerationId: 'gen-1',
    nextStatus: 'complete',
  });

  assert.deepEqual(where, {
    id: 'job-1',
    OR: [{ generationId: 'gen-1' }, { generationId: null }],
  });
});

test('classifyOrchestratorJobUpdateRejectReason prioritizes generation mismatch', () => {
  const reason = classifyOrchestratorJobUpdateRejectReason({
    row: { generationId: 'gen-2', status: 'running' },
    expectedGenerationId: 'gen-1',
    nextStatus: 'running',
  });

  assert.equal(reason, 'generation_mismatch');
});

test('classifyOrchestratorJobUpdateRejectReason identifies terminal-state protection', () => {
  const reason = classifyOrchestratorJobUpdateRejectReason({
    row: { generationId: 'gen-1', status: 'complete' },
    expectedGenerationId: 'gen-1',
    nextStatus: 'running',
  });

  assert.equal(reason, 'terminal_state_protection');
});

test('classifyOrchestratorJobUpdateRejectReason returns not_found when row is missing', () => {
  const reason = classifyOrchestratorJobUpdateRejectReason({
    row: null,
    expectedGenerationId: 'gen-1',
    nextStatus: 'running',
  });

  assert.equal(reason, 'not_found');
});

test('classifyOrchestratorJobUpdateRejectReason returns guard_rejected when no explicit mismatch is detected', () => {
  const reason = classifyOrchestratorJobUpdateRejectReason({
    row: { generationId: null, status: 'running' },
    expectedGenerationId: 'gen-1',
    nextStatus: 'running',
  });

  assert.equal(reason, 'guard_rejected');
});
