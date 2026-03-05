'use client';

import { useAppSelector } from '@/store/hooks';
import { deriveOrchestratorProgressUi } from './orchestrator-progress-ui';

export function OrchestratorJobStatus() {
  const job = useAppSelector((state) => {
    const activeId = state.orchestrator.activeJobId;
    return activeId ? state.orchestrator.jobs[activeId] : null;
  });
  const isVisualReady = useAppSelector((state) => state.globe.destinations.length > 0);
  const ui = job ? deriveOrchestratorProgressUi(job, undefined, isVisualReady) : null;

  if (!job || !ui) return null;

  return (
    <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--muted-foreground)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[var(--foreground)] font-medium">Trip planner</span>
          {ui.indeterminate && job.status !== 'error' && (
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--princeton-orange)]"
            />
          )}
        </div>
        {!ui.indeterminate && ui.percent !== null && <span>{ui.percent}%</span>}
      </div>
      <div className="mt-1">
        <span>{job.status === 'error' ? job.error || job.message : ui.label}</span>
      </div>
      {ui.percent !== null && (
        <div className="mt-2 h-1.5 rounded-full bg-[var(--border)]">
          <div
            className={`h-1.5 rounded-full bg-[var(--princeton-orange)] transition-all ${
              ui.indeterminate ? 'animate-pulse' : ''
            }`}
            style={{ width: `${ui.percent}%` }}
          />
        </div>
      )}
      {job.status === 'error' && job.error && (
        <div className="mt-2 text-xs text-red-600">{job.error}</div>
      )}
    </div>
  );
}
