import type { ItineraryPlan } from './types';
import type { HostMarker } from './trip-session';

export type OrchestratorJobStatus = 'draft' | 'running' | 'complete' | 'error';
export type OrchestratorJobStage = 'draft' | 'geocoding' | 'routing' | 'hosts' | 'final' | 'complete' | 'error';

export type OrchestratorJobProgress = {
  stage: OrchestratorJobStage;
  message: string;
  current?: number;
  total?: number;
};

export type OrchestratorJob = {
  id: string;
  prompt: string;
  status: OrchestratorJobStatus;
  progress: OrchestratorJobProgress;
  createdAt: number;
  updatedAt: number;
  plan?: ItineraryPlan;
  hostMarkers?: HostMarker[];
  error?: string;
};

// Use globalThis to persist jobs across hot reloads in development
const globalForJobs = globalThis as unknown as {
  orchestratorJobs: Map<string, OrchestratorJob>;
};

if (!globalForJobs.orchestratorJobs) {
  globalForJobs.orchestratorJobs = new Map<string, OrchestratorJob>();
}

const jobs = globalForJobs.orchestratorJobs;
const JOB_TTL_MS = 1000 * 60 * 30;

function scheduleCleanup(id: string) {
  setTimeout(() => {
    jobs.delete(id);
  }, JOB_TTL_MS);
}

export function createOrchestratorJob(
  prompt: string,
  progress: OrchestratorJobProgress
): OrchestratorJob {
  const now = Date.now();
  const job: OrchestratorJob = {
    id: crypto.randomUUID(),
    prompt,
    status: 'draft',
    progress,
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  scheduleCleanup(job.id);
  return job;
}

export function updateOrchestratorJob(
  id: string,
  updates: Partial<Omit<OrchestratorJob, 'id' | 'prompt' | 'createdAt'>> & {
    progress?: Partial<OrchestratorJobProgress>;
  }
): OrchestratorJob | null {
  const job = jobs.get(id);
  if (!job) return null;

  if (updates.progress) {
    job.progress = { ...job.progress, ...updates.progress };
  }

  if (typeof updates.status === 'string') {
    job.status = updates.status;
  }

  if (typeof updates.error === 'string') {
    job.error = updates.error;
  }

  if (updates.plan) {
    job.plan = updates.plan;
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'hostMarkers')) {
    job.hostMarkers = updates.hostMarkers;
  }

  job.updatedAt = Date.now();
  jobs.set(id, job);
  return job;
}

export function completeOrchestratorJob(
  id: string,
  plan: ItineraryPlan,
  hostMarkers?: HostMarker[]
): OrchestratorJob | null {
  return updateOrchestratorJob(id, {
    status: 'complete',
    plan,
    hostMarkers,
    progress: {
      stage: 'complete',
      message: 'Plan ready',
    },
  });
}

export function failOrchestratorJob(id: string, error: string): OrchestratorJob | null {
  return updateOrchestratorJob(id, {
    status: 'error',
    error,
    progress: {
      stage: 'error',
      message: 'Failed to build trip plan',
    },
  });
}

export function getOrchestratorJob(id: string): OrchestratorJob | null {
  return jobs.get(id) ?? null;
}
