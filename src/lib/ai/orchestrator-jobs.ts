/**
 * Orchestrator Job Management — Prisma-backed
 *
 * Replaces the previous in-memory Map implementation so job state
 * survives serverless cold starts and multi-instance deployments.
 *
 * Every function is async since it hits the database.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { ItineraryPlan } from './types';
import type { HostMarker } from './trip-session';

const DEBUG_ORCHESTRATOR_JOBS = process.env.DEBUG_ORCHESTRATOR_JOBS === '1';

function logOrchestratorJobDebug(event: string, payload: Record<string, unknown>) {
  if (!DEBUG_ORCHESTRATOR_JOBS) return;
  console.info(`[orchestrator-jobs] ${event}`, payload);
}

function summarizeJobRowForDebug(
  row:
    | {
        id: string;
        status: string;
        stage: string;
        message: string | null;
        generationId: string | null;
        generationMode: string | null;
        updatedAt: Date;
        progressCurrent: number | null;
        progressTotal: number | null;
      }
    | null
) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    stage: row.stage,
    message: row.message,
    generationId: row.generationId,
    generationMode: row.generationMode,
    updatedAt: row.updatedAt.toISOString(),
    current: row.progressCurrent,
    total: row.progressTotal,
  };
}

// ============================================================================
// Types (unchanged public API shape)
// ============================================================================

export type OrchestratorJobStatus = 'draft' | 'running' | 'complete' | 'error';
export type OrchestratorJobStage = 'draft' | 'geocoding' | 'routing' | 'hosts' | 'final' | 'complete' | 'error';
export type OrchestratorGenerationMode = 'draft' | 'refine';

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
  generationId?: string;
  generationMode?: OrchestratorGenerationMode;
  plan?: ItineraryPlan;
  hostMarkers?: HostMarker[];
  error?: string;
};

// ============================================================================
// Helpers — map between Prisma row ↔ public OrchestratorJob shape
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToJob(row: any): OrchestratorJob {
  return {
    id: row.id,
    prompt: row.prompt,
    status: row.status as OrchestratorJobStatus,
    progress: {
      stage: row.stage as OrchestratorJobStage,
      message: row.message ?? '',
      current: row.progressCurrent ?? undefined,
      total: row.progressTotal ?? undefined,
    },
    createdAt: new Date(row.createdAt).getTime(),
    updatedAt: new Date(row.updatedAt).getTime(),
    generationId: row.generationId ?? undefined,
    generationMode: row.generationMode as OrchestratorGenerationMode | undefined,
    plan: row.plan as ItineraryPlan | undefined,
    hostMarkers: row.hostMarkers as HostMarker[] | undefined,
    error: row.error ?? undefined,
  };
}

// ============================================================================
// CRUD functions
// ============================================================================

export async function createOrchestratorJob(
  prompt: string,
  progress: OrchestratorJobProgress,
  metadata?: {
    generationId?: string;
    generationMode?: OrchestratorGenerationMode;
  }
): Promise<OrchestratorJob> {
  const row = await prisma.orchestratorJob.create({
    data: {
      prompt,
      status: 'draft',
      stage: progress.stage,
      message: progress.message,
      progressCurrent: progress.current ?? null,
      progressTotal: progress.total ?? null,
      generationId: metadata?.generationId ?? null,
      generationMode: metadata?.generationMode ?? null,
    },
  });
  return rowToJob(row);
}

export async function updateOrchestratorJob(
  id: string,
  updates: Partial<Omit<OrchestratorJob, 'id' | 'createdAt'>> & {
    progress?: Partial<OrchestratorJobProgress>;
  }
): Promise<OrchestratorJob | null> {
  try {
    const beforeRow = DEBUG_ORCHESTRATOR_JOBS
      ? await prisma.orchestratorJob.findUnique({
          where: { id },
          select: {
            id: true,
            status: true,
            stage: true,
            message: true,
            generationId: true,
            generationMode: true,
            updatedAt: true,
            progressCurrent: true,
            progressTotal: true,
          },
        })
      : null;

    // Build the flat Prisma update data from the nested public shape
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};

    if (typeof updates.status === 'string') data.status = updates.status;
    if (typeof updates.error === 'string') data.error = updates.error;
    if (typeof updates.prompt === 'string') data.prompt = updates.prompt;
    if (typeof updates.generationId === 'string') data.generationId = updates.generationId;
    if (updates.generationMode === 'draft' || updates.generationMode === 'refine') {
      data.generationMode = updates.generationMode;
    }
    if (updates.plan !== undefined) data.plan = updates.plan ?? Prisma.JsonNull;
    if (Object.prototype.hasOwnProperty.call(updates, 'hostMarkers')) {
      data.hostMarkers = updates.hostMarkers ?? Prisma.JsonNull;
    }

    // Progress fields
    if (updates.progress) {
      if (updates.progress.stage) data.stage = updates.progress.stage;
      if (typeof updates.progress.message === 'string') data.message = updates.progress.message;
      if (updates.progress.current !== undefined) data.progressCurrent = updates.progress.current;
      if (updates.progress.total !== undefined) data.progressTotal = updates.progress.total;
    }

    logOrchestratorJobDebug('update.request', {
      id,
      before: summarizeJobRowForDebug(beforeRow),
      update: {
        status: typeof updates.status === 'string' ? updates.status : null,
        error: typeof updates.error === 'string' ? updates.error : null,
        generationId: typeof updates.generationId === 'string' ? updates.generationId : null,
        generationMode:
          updates.generationMode === 'draft' || updates.generationMode === 'refine'
            ? updates.generationMode
            : null,
        hasPlan: Object.prototype.hasOwnProperty.call(updates, 'plan'),
        hasHostMarkers: Object.prototype.hasOwnProperty.call(updates, 'hostMarkers'),
        progress: updates.progress
          ? {
              stage: updates.progress.stage ?? null,
              message: updates.progress.message ?? null,
              current: updates.progress.current ?? null,
              total: updates.progress.total ?? null,
            }
          : null,
      },
    });

    const row = await prisma.orchestratorJob.update({
      where: { id },
      data,
    });
    logOrchestratorJobDebug('update.result', {
      id,
      before: summarizeJobRowForDebug(beforeRow),
      after: summarizeJobRowForDebug({
        id: row.id,
        status: row.status,
        stage: row.stage,
        message: row.message,
        generationId: row.generationId,
        generationMode: row.generationMode,
        updatedAt: row.updatedAt,
        progressCurrent: row.progressCurrent,
        progressTotal: row.progressTotal,
      }),
      regressedFromComplete:
        beforeRow?.status === 'complete' && row.status !== 'complete',
    });
    return rowToJob(row);
  } catch (error) {
    logOrchestratorJobDebug('update.error', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    // Record not found
    return null;
  }
}

export async function completeOrchestratorJob(
  id: string,
  plan: ItineraryPlan,
  hostMarkers?: HostMarker[]
): Promise<OrchestratorJob | null> {
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

export async function resetOrchestratorJob(
  id: string,
  input: {
    prompt: string;
    progress: OrchestratorJobProgress;
    generationId: string;
    generationMode: OrchestratorGenerationMode;
  }
): Promise<OrchestratorJob | null> {
  try {
    const row = await prisma.orchestratorJob.update({
      where: { id },
      data: {
        prompt: input.prompt,
        status: 'draft',
        stage: input.progress.stage,
        message: input.progress.message,
        progressCurrent: input.progress.current ?? null,
        progressTotal: input.progress.total ?? null,
        generationId: input.generationId,
        generationMode: input.generationMode,
        plan: Prisma.JsonNull,
        hostMarkers: Prisma.JsonNull,
        error: null,
      },
    });
    return rowToJob(row);
  } catch {
    return null;
  }
}

export async function failOrchestratorJob(id: string, error: string): Promise<OrchestratorJob | null> {
  return updateOrchestratorJob(id, {
    status: 'error',
    error,
    progress: {
      stage: 'error',
      message: 'Failed to build trip plan',
    },
  });
}

const STALE_JOB_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export async function getOrchestratorJob(id: string): Promise<OrchestratorJob | null> {
  const row = await prisma.orchestratorJob.findUnique({ where: { id } });
  if (!row) return null;

  // Auto-fail jobs stuck in 'running' for too long (orphaned by dead serverless instance)
  if (
    row.status === 'running' &&
    Date.now() - new Date(row.updatedAt).getTime() > STALE_JOB_THRESHOLD_MS
  ) {
    console.warn(`[OrchestratorJob] Auto-failing stale job ${id} (last updated ${row.updatedAt})`);
    const failed = await failOrchestratorJob(id, 'Generation timed out — please try again');
    return failed;
  }

  return rowToJob(row);
}
