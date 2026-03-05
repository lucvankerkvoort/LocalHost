import type { DraftItinerary } from '@/lib/ai/orchestrator';
import { buildHostMarkersFromPlan } from '@/lib/ai/host-markers';
import {
  convertPlanToGlobeData,
  mapTransportPreferenceToMode,
  extractTransportPreference,
} from '@/lib/ai/plan-converter';
import { convertGlobeDestinationsToApiPayload } from '@/lib/api/trip-converter';
import { generateTripTitleFromPlan } from '@/lib/trips/title';
import { saveTripPlanPayloadForUser } from '@/lib/trips/repository';
import {
  TripPlanWritePayloadSchema,
  formatTripPlanValidationIssues,
} from '@/lib/trips/contracts/trip-plan.schema';
import {
  GenerationController,
  type GenerationTask,
} from './generation-controller';
import type { PlannerGenerationSnapshot } from './planner-state';

const DEBUG_ORCHESTRATOR_PROGRESS =
  process.env.DEBUG_ORCHESTRATOR_PROGRESS === '1' || process.env.DEBUG_ORCHESTRATOR_JOBS === '1';

function logPlannerProgressDebug(event: string, payload: Record<string, unknown>) {
  if (!DEBUG_ORCHESTRATOR_PROGRESS) return;
  console.info(`[planning-agent][progress] ${event}`, payload);
}

type HydrationTotals = {
  geocodes: number;
  routes: number;
  hosts: number;
};

function getHydrationTotals(draft: DraftItinerary): HydrationTotals {
  // During planTripFromDraft, processDay calls resolve_place for:
  // 1. The day anchor (often 1 call, but sometimes 2 if fallback city center is needed)
  // 2. Each activity
  // Since we can't perfectly predict the fallback, we use activities + 1 as a baseline
  // and ensure the progress bar completes even if the exact number varies slightly.
  const geocodes = draft.days.reduce((sum, day) => sum + day.activities.length + 1, 0);
  const routes = draft.days.filter((day) => day.activities.length > 1).length;
  const hosts = draft.days.length;
  return { geocodes, routes, hosts };
}

function buildProgress(
  geocoded: number,
  totals: HydrationTotals,
  routed: number,
  hosted: number,
  isHydrationComplete: boolean = false
) {
  if (!isHydrationComplete && geocoded < totals.geocodes) {
    return {
      stage: 'geocoding' as const,
      message: 'Hydrating places',
      current: Math.min(geocoded, totals.geocodes),
      total: totals.geocodes,
    };
  }

  if (totals.routes > 0 && routed < totals.routes) {
    return {
      stage: 'routing' as const,
      message: 'Building routes',
      current: routed,
      total: totals.routes,
    };
  }

  if (totals.hosts > 0 && hosted < totals.hosts) {
    return {
      stage: 'hosts' as const,
      message: 'Finding hosts',
      current: hosted,
      total: totals.hosts,
    };
  }

  return {
    stage: 'final' as const,
    message: 'Finalizing plan',
  };
}

export function getGenerationStartMessage(mode: 'draft' | 'refine'): string {
  return mode === 'draft' ? 'Drafting your trip...' : 'Refining your trip...';
}

export function getQueuedMessage(): string {
  return 'Got it. I will apply your latest updates after this pass.';
}

async function runPlannerGenerationTask(
  task: GenerationTask<PlannerGenerationSnapshot>
) {
  const { ItineraryOrchestrator } = await import('@/lib/ai/orchestrator');
  const { updateOrchestratorJob } = await import('@/lib/ai/orchestrator-jobs');
  const { jobWriteQueue } = await import('@/lib/ai/job-write-queue');
  const { jobId, mode, snapshot, signal, isLatest, generationId } = task;
  const shouldIgnore = () => signal.aborted || !isLatest();

  try {
    const orchestrator = new ItineraryOrchestrator();
    const startTime = Date.now();
    const draftResult = await orchestrator.planTripDraft(snapshot.request);
    console.log(
      `[PlanningAgent] planTripDraft completed in ${Date.now() - startTime}ms (${mode})`
    );

    if (shouldIgnore()) {
      return;
    }

    if (!draftResult.plan) {
      logPlannerProgressDebug('draft.missing-plan', {
        jobId,
        generationId,
        mode,
      });
      await jobWriteQueue.flush(jobId, {
        status: 'error',
        error: 'Unable to locate the main city for this trip.',
        expectedGenerationId: generationId,
        progress: { stage: 'error', message: 'Unable to locate the main city for this trip.' },
      });
      return;
    }

    logPlannerProgressDebug('draft.write.start', {
      jobId,
      generationId,
      mode,
      days: draftResult.plan.days.length,
      title: draftResult.plan.title,
    });
    const draftWriteResult = await updateOrchestratorJob(jobId, {
      status: 'draft',
      plan: draftResult.plan,
      expectedGenerationId: generationId,
      progress: {
        stage: 'draft',
        message: `Draft ready: ${draftResult.plan.title}`,
      },
    });
    logPlannerProgressDebug('draft.write.result', {
      jobId,
      generationId,
      applied: draftWriteResult.applied,
      reason: draftWriteResult.reason,
      rowStatus: draftWriteResult.row?.status ?? null,
      rowStage: draftWriteResult.row?.progress.stage ?? null,
      rowGenerationId: draftWriteResult.row?.generationId ?? null,
      rowUpdatedAt: draftWriteResult.row?.updatedAt ?? null,
    });

    const totals = getHydrationTotals(draftResult.context.draft);
    let geocoded = 0;
    let routed = 0;
    let hosted = 0;
    let progressWriteSeq = 0;

    const updateProgress = () => {
      if (shouldIgnore()) return;
      const progress = buildProgress(geocoded, totals, routed, hosted);
      const seq = ++progressWriteSeq;
      logPlannerProgressDebug('progress.enqueue', {
        jobId,
        generationId,
        seq,
        progress,
        counters: {
          geocoded,
          routed,
          hosted,
          geocodeTotal: totals.geocodes,
          routeTotal: totals.routes,
          hostTotal: totals.hosts,
        },
      });
      jobWriteQueue.enqueue(jobId, { status: 'running', expectedGenerationId: generationId, progress });
    };

    const hydrationOrchestrator = new ItineraryOrchestrator(undefined, {
      onToolResult: (toolName) => {
        if (shouldIgnore()) return;
        if (toolName === 'resolve_place') geocoded += 1;
        if (toolName === 'generate_route') routed += 1;
        if (toolName === 'search_localhosts') hosted += 1;
        logPlannerProgressDebug('tool.result', {
          jobId,
          generationId,
          toolName,
          counters: { geocoded, routed, hosted },
        });
        updateProgress();
      },
    });

    updateProgress();
    const plan = await hydrationOrchestrator.planTripFromDraft(
      snapshot.request,
      draftResult.context.draft,
      draftResult.context.tripAnchor,
      draftResult.context.inventory
    );
    if (shouldIgnore()) return;

    const hostMarkers = buildHostMarkersFromPlan(plan);
    logPlannerProgressDebug('complete.flush.start', {
      jobId,
      generationId,
      hostMarkerCount: hostMarkers.length,
      dayCount: plan.days.length,
    });
    if (snapshot.tripId) {
      if (!snapshot.userId) {
        throw new Error(
          `Missing user context for planner persistence (tripId=${snapshot.tripId})`
        );
      }
      logPlannerProgressDebug('complete.persist.start', {
        jobId,
        generationId,
        tripId: snapshot.tripId,
      });
      try {
        const { destinations } = convertPlanToGlobeData(plan);
        const { stops } = convertGlobeDestinationsToApiPayload(destinations);
        const title = generateTripTitleFromPlan(plan);
        const transportPreference = mapTransportPreferenceToMode(
          extractTransportPreference(plan.request)
        );
        const preferences = transportPreference ? { transportPreference } : undefined;
        const parsedPayload = TripPlanWritePayloadSchema.safeParse({
          stops,
          preferences,
          title,
        });
        if (!parsedPayload.success) {
          const validationSummary = formatTripPlanValidationIssues(parsedPayload.error)
            .slice(0, 6)
            .map((issue) => `${issue.path}: ${issue.message}`)
            .join('; ');
          throw new Error(
            `Planner payload validation failed before persistence. ${validationSummary}`
          );
        }
        await saveTripPlanPayloadForUser({
          tripId: snapshot.tripId,
          userId: snapshot.userId,
          ...parsedPayload.data,
          expectedVersion: snapshot.expectedVersion,
          audit: {
            source: 'planner',
            actor: 'planning-agent',
            jobId,
            generationId,
            reason: 'planner_generation_complete',
          },
        });
        logPlannerProgressDebug('complete.persist.success', {
          jobId,
          generationId,
        });
      } catch (persistError) {
        logPlannerProgressDebug('complete.persist.error', {
          jobId,
          generationId,
          error: persistError instanceof Error ? persistError.message : String(persistError),
        });
        throw persistError;
      }
    }

    const completeResult = await jobWriteQueue.flush(jobId, {
      status: 'complete',
      plan,
      hostMarkers,
      expectedGenerationId: generationId,
      progress: { stage: 'complete', message: 'Plan ready' },
    });
    logPlannerProgressDebug('complete.flush.result', {
      jobId,
      generationId,
      applied: completeResult.applied,
      reason: completeResult.reason,
      rowStatus: completeResult.row?.status ?? null,
      rowStage: completeResult.row?.progress.stage ?? null,
      rowGenerationId: completeResult.row?.generationId ?? null,
      rowUpdatedAt: completeResult.row?.updatedAt ?? null,
    });
  } catch (error) {
    if (shouldIgnore()) return;
    const errorMsg = error instanceof Error ? error.message : 'Failed to generate itinerary.';
    logPlannerProgressDebug('generation.error', {
      jobId,
      generationId,
      mode,
      error: errorMsg,
    });
    await jobWriteQueue.flush(jobId, {
      status: 'error',
      error: errorMsg,
      expectedGenerationId: generationId,
      progress: { stage: 'error', message: errorMsg },
    });
  }
}

export const plannerGenerationController = new GenerationController<PlannerGenerationSnapshot>({
  refineDebounceMs: 600,
  ensureJobId: async ({ existingJobId, snapshot, mode, generationId }) => {
    const { createOrchestratorJob, resetOrchestratorJob } = await import(
      '@/lib/ai/orchestrator-jobs'
    );
    const progress = {
      stage: 'draft' as const,
      message: getGenerationStartMessage(mode),
    };

    if (existingJobId) {
      const reset = await resetOrchestratorJob(existingJobId, {
        prompt: snapshot.request,
        progress,
        generationId,
        generationMode: mode,
      });
      if (reset) return reset.id;
    }

    const created = await createOrchestratorJob(snapshot.request, progress, {
      generationId,
      generationMode: mode,
    });
    return created.id;
  },
  onQueued: async ({ jobId, generationId }) => {
    const { jobWriteQueue } = await import('@/lib/ai/job-write-queue');
    if (!generationId) {
      logPlannerProgressDebug('queued.skipped-missing-generation', { jobId });
      return;
    }
    jobWriteQueue.enqueue(jobId, {
      status: 'running',
      expectedGenerationId: generationId,
      progress: {
        stage: 'final',
        message: getQueuedMessage(),
      },
    });
  },
  runGeneration: runPlannerGenerationTask,
});
