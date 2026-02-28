import type { OrchestratorJobState } from '@/store/orchestrator-slice';

export type OrchestratorProgressUi = {
  label: string;
  percent: number | null;
  indeterminate: boolean;
  displayState: 'planning' | 'visual_ready_syncing' | 'complete' | 'error';
};

type StageBand = {
  start: number;
  end: number;
  label: string;
};

const STAGE_BANDS: Record<
  Exclude<OrchestratorJobState['stage'], 'complete' | 'error'>,
  StageBand
> = {
  draft: { start: 5, end: 20, label: 'Planning your trip...' },
  geocoding: { start: 20, end: 45, label: 'Finding places and travel times...' },
  routing: { start: 45, end: 65, label: 'Calculating routes...' },
  hosts: { start: 65, end: 90, label: 'Looking for places to stay...' },
  final: { start: 90, end: 98, label: 'Finalizing itinerary...' },
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasValidCounters(job: OrchestratorJobState): boolean {
  return (
    typeof job.current === 'number' &&
    typeof job.total === 'number' &&
    Number.isFinite(job.current) &&
    Number.isFinite(job.total) &&
    job.total > 0
  );
}

export function deriveOrchestratorProgressUi(
  job: OrchestratorJobState,
  previousPercent?: number | null,
  hasVisualDraft: boolean = false
): OrchestratorProgressUi {
  if (job.status === 'error') {
    return {
      label: 'Planner hit an error',
      percent:
        typeof previousPercent === 'number' && Number.isFinite(previousPercent)
          ? clampPercent(previousPercent)
          : null,
      indeterminate: false,
      displayState: 'error',
    };
  }

  if (job.status === 'complete' || job.stage === 'complete') {
    return {
      label: 'Trip plan ready',
      percent: 100,
      indeterminate: false,
      displayState: 'complete',
    };
  }

  const band = STAGE_BANDS[job.stage as keyof typeof STAGE_BANDS] ?? STAGE_BANDS.geocoding;
  const countersValid = hasValidCounters(job);

  let nextPercent = countersValid
    ? clampPercent(
        band.start + ((job.current as number) / (job.total as number)) * (band.end - band.start)
      )
    : band.start;

  if (typeof previousPercent === 'number' && Number.isFinite(previousPercent)) {
    nextPercent = Math.max(previousPercent, nextPercent);
  }

  return {
    label: hasVisualDraft ? 'Optimizing routes and hosts...' : band.label,
    percent: nextPercent,
    indeterminate: !countersValid,
    displayState: hasVisualDraft ? 'visual_ready_syncing' : 'planning',
  };
}

