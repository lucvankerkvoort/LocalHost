'use client';

import { useAppSelector } from '@/store/hooks';

export function OrchestratorJobStatus() {
  const job = useAppSelector((state) => {
    const activeId = state.orchestrator.activeJobId;
    return activeId ? state.orchestrator.jobs[activeId] : null;
  });

  if (!job) return null;

  const percent =
    typeof job.current === 'number' && typeof job.total === 'number' && job.total > 0
      ? Math.min(100, Math.max(0, Math.round((job.current / job.total) * 100)))
      : null;

  return (
    <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--muted-foreground)]">
      <div className="flex items-center justify-between">
        <span className="text-[var(--foreground)] font-medium">Trip planner</span>
        {percent !== null && <span>{percent}%</span>}
      </div>
      <div className="mt-1">
        <span>{job.message}</span>
        {typeof job.current === 'number' && typeof job.total === 'number' && job.total > 0 && (
          <span>{` (${job.current}/${job.total})`}</span>
        )}
      </div>
      {percent !== null && (
        <div className="mt-2 h-1.5 rounded-full bg-[var(--border)]">
          <div
            className="h-1.5 rounded-full bg-[var(--princeton-orange)] transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {job.status === 'error' && job.error && (
        <div className="mt-2 text-xs text-red-600">{job.error}</div>
      )}
    </div>
  );
}
