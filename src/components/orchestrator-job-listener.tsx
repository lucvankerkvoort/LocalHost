'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { jobStarted, jobProgress, jobCompleted, jobFailed } from '@/store/orchestrator-slice';
import { recordToolResult } from '@/lib/ai/tool-events';
import { saveTripPlanForTrip } from '@/store/globe-thunks';
import type { ItineraryPlan } from '@/lib/ai/types';
import { getTripIdFromPath } from '@/components/features/chat-widget-handshake';

const POLL_INTERVAL_MS = 1500;
const DEBUG_ORCHESTRATOR_LISTENER = process.env.NEXT_PUBLIC_DEBUG_ORCHESTRATOR_PROGRESS === '1';
const TRACE = true; // temporary trace for debugging

function logOrchestratorListenerDebug(event: string, payload: Record<string, unknown>) {
  if (!DEBUG_ORCHESTRATOR_LISTENER) return;
  console.info(`[orchestrator-listener] ${event}`, payload);
}

export function OrchestratorJobListener() {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const latestGenerate = useAppSelector(
    (state) => state.toolCalls.lastResultsByTool.generateItinerary
  );
  const activeTripId = useAppSelector((state) => state.globe.tripId);
  const tripIdFromPath = getTripIdFromPath(pathname);
  const pollRef = useRef<{
    jobId?: string;
    generationId?: string;
    timer?: number;
    inFlight?: boolean;
  }>({});
  const draftAppliedRef = useRef<Record<string, string>>({});
  const completeAppliedRef = useRef<Record<string, string>>({});
  const startedRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (TRACE) console.log('[TRACE] useEffect fired', {
      hasLatestGenerate: !!latestGenerate,
      tripIdFromPath: tripIdFromPath ?? null,
      activeTripId: activeTripId ?? null,
    });
    const result = latestGenerate?.result as {
      jobId?: string;
      message?: string;
      tripId?: string;
      generationId?: string;
    } | undefined;
    const resultTripId =
      typeof result?.tripId === 'string' && result.tripId.trim().length > 0
        ? result.tripId
        : undefined;
    if (tripIdFromPath) {
      // Trip pages must only react to trip-scoped planner jobs for the current route.
      if (!resultTripId || resultTripId !== tripIdFromPath) {
        logOrchestratorListenerDebug('ignore.mismatched-trip-result', {
          routeTripId: tripIdFromPath,
          resultTripId: resultTripId ?? null,
          latestJobId: result?.jobId ?? null,
          latestGenerationId: result?.generationId ?? null,
        });
        if (TRACE) console.log('[TRACE] bail: tripId mismatch', {
          routeTripId: tripIdFromPath,
          resultTripId: resultTripId ?? null,
        });
        return;
      }
    }
    const jobId = result?.jobId;
    const toolGenerationId =
      typeof result?.generationId === 'string' ? result.generationId : undefined;
    const jobTripId = resultTripId ?? activeTripId ?? undefined;
    if (!jobId) {
      if (TRACE) console.log('[TRACE] bail: no jobId');
      return;
    }
    const pollState = pollRef.current;
    const generationKey = toolGenerationId ?? pollState.generationId ?? 'unknown';

    // Don't restart polling for a job that's already been completed.
    // When completion fires recordToolResult, latestGenerate changes,
    // useEffect re-runs, and without this guard it would dispatch
    // jobStarted again — resetting the bar back to draft/20%.
    if (completeAppliedRef.current[jobId] === generationKey) {
      if (TRACE) console.log('[TRACE] skip: already completed', { jobId, generationKey });
      return;
    }

    const sameJob = pollState.jobId === jobId;
    const sameGeneration = toolGenerationId
      ? pollState.generationId === toolGenerationId
      : true;
    const hasActivePoll = typeof pollState.timer === 'number';
    if (sameJob && sameGeneration && hasActivePoll) {
      if (TRACE) console.log('[TRACE] skip: same job+gen, active poll', { jobId, generationKey });
      return;
    }
    logOrchestratorListenerDebug('poll.start', {
      jobId,
      toolGenerationId: toolGenerationId ?? null,
      jobTripId: jobTripId ?? null,
      routeTripId: tripIdFromPath ?? null,
      activeTripId: activeTripId ?? null,
    });

    pollState.jobId = jobId;
    if (toolGenerationId) {
      pollState.generationId = toolGenerationId;
    }

    // Only dispatch jobStarted once per job+generation.
    // When recordToolResult (draft or complete) changes latestGenerate,
    // React re-runs this effect. The cleanup clears the old interval,
    // so we need to re-establish the poll below — but we must NOT
    // re-dispatch jobStarted or it resets the progress bar to 20%.
    if (startedRef.current[jobId] !== generationKey) {
      startedRef.current[jobId] = generationKey;
      if (TRACE) console.log('[TRACE] dispatch jobStarted', { jobId, generationKey, stage: 'draft' });
      dispatch(
        jobStarted({
          id: jobId,
          stage: 'draft',
          message: result?.message ?? 'Draft ready',
        })
      );
    } else {
      if (TRACE) console.log('[TRACE] skip jobStarted (already started)', { jobId, generationKey });
    }

    const poll = async () => {
      if (pollState.inFlight) return;
      pollState.inFlight = true;

      try {
        const response = await fetch(`/api/orchestrator?jobId=${encodeURIComponent(jobId)}`);
        const data = await response.json();
        if (!response.ok || !data.success) {
          logOrchestratorListenerDebug('poll.bad-response', {
            jobId,
            httpStatus: response.status,
            success: Boolean(data?.success),
          });
          return;
        }

        const job = data.job as {
          status: 'draft' | 'running' | 'complete' | 'error';
          generationId?: string;
          generationMode?: 'draft' | 'refine';
          progress?: { stage?: string; message?: string; current?: number; total?: number };
          plan?: unknown;
          hostMarkers?: unknown;
          error?: string;
        };
        const jobGenerationId =
          typeof job.generationId === 'string' ? job.generationId : 'unknown';
        logOrchestratorListenerDebug('poll.snapshot', {
          jobId,
          jobTripId: jobTripId ?? null,
          status: job.status,
          generationId: jobGenerationId,
          generationMode: job.generationMode ?? null,
          hasPlan: Boolean(job.plan),
          hostMarkerCount: Array.isArray(job.hostMarkers) ? job.hostMarkers.length : null,
          progress: job.progress
            ? {
                stage: job.progress.stage ?? null,
                message: job.progress.message ?? null,
                current:
                  typeof job.progress.current === 'number' ? job.progress.current : null,
                total: typeof job.progress.total === 'number' ? job.progress.total : null,
              }
            : null,
        });

        if (pollState.generationId !== jobGenerationId) {
          if (TRACE) console.log('[TRACE] poll: generation advanced, dispatching jobStarted AGAIN', {
            jobId, prev: pollState.generationId, next: jobGenerationId,
          });
          logOrchestratorListenerDebug('poll.generation-advanced', {
            jobId,
            previousGenerationId: pollState.generationId ?? null,
            nextGenerationId: jobGenerationId,
          });
          pollState.generationId = jobGenerationId;
          dispatch(
            jobStarted({
              id: jobId,
              stage: 'draft',
              message: job.progress?.message ?? 'Drafting itinerary',
            })
          );
        }

        if (
          job.plan &&
          job.status !== 'complete' &&
          draftAppliedRef.current[jobId] !== jobGenerationId
        ) {
          logOrchestratorListenerDebug('apply.draft-plan', {
            jobId,
            generationId: jobGenerationId,
            tripId: jobTripId ?? null,
          });
          draftAppliedRef.current[jobId] = jobGenerationId;
          if (TRACE) console.log('[TRACE] poll: calling recordToolResult for DRAFT', {
            jobId, generationId: jobGenerationId,
          });
          recordToolResult(dispatch, {
            toolName: 'generateItinerary',
            result: {
              success: true,
              jobId,
              plan: job.plan,
              hostMarkers: job.hostMarkers ?? [],
              tripId: jobTripId,
              generationId: jobGenerationId,
            },
            source: 'orchestrator',
          });
        }

        if (job.status === 'complete' && job.plan) {
          if (completeAppliedRef.current[jobId] === jobGenerationId) {
            logOrchestratorListenerDebug('apply.complete.skip-duplicate', {
              jobId,
              generationId: jobGenerationId,
            });
            window.clearInterval(intervalId);
            pollState.timer = undefined;
            return;
          }
          logOrchestratorListenerDebug('apply.complete-plan', {
            jobId,
            generationId: jobGenerationId,
            tripId: jobTripId ?? null,
          });
          completeAppliedRef.current[jobId] = jobGenerationId;
          dispatch(jobCompleted({ id: jobId }));
          recordToolResult(dispatch, {
            toolName: 'generateItinerary',
            result: {
              success: true,
              jobId,
              plan: job.plan,
              hostMarkers: job.hostMarkers ?? [],
              tripId: jobTripId,
              generationId: jobGenerationId,
            },
            source: 'orchestrator',
          });
          if (jobTripId) {
            logOrchestratorListenerDebug('persist.trip-plan.dispatch', {
              jobId,
              generationId: jobGenerationId,
              tripId: jobTripId,
            });
            dispatch(saveTripPlanForTrip({ tripId: jobTripId, plan: job.plan as ItineraryPlan }));
          }
          window.clearInterval(intervalId);
          pollState.timer = undefined;
          return;
        }

        if (job.status === 'error') {
          logOrchestratorListenerDebug('poll.error-status', {
            jobId,
            generationId: jobGenerationId,
            error: job.error || 'Failed to build itinerary.',
          });
          dispatch(jobFailed({ id: jobId, error: job.error || 'Failed to build itinerary.' }));
          window.clearInterval(intervalId);
          pollState.timer = undefined;
          return;
        }

        if (job.progress) {
          const stage = job.progress.stage;
          const normalizedStage =
            stage === 'draft' ||
            stage === 'geocoding' ||
            stage === 'routing' ||
            stage === 'hosts' ||
            stage === 'final' ||
            stage === 'complete' ||
            stage === 'error'
              ? stage
              : 'geocoding';
          if (TRACE) console.log('[TRACE] poll: dispatching jobProgress', {
            jobId, stage: normalizedStage, current: job.progress.current, total: job.progress.total,
          });
          dispatch(
            jobProgress({
              id: jobId,
              stage: normalizedStage,
              message: job.progress.message || 'Working...',
              current: job.progress.current,
              total: job.progress.total,
            })
          );
        }
      } catch (error) {
        logOrchestratorListenerDebug('poll.exception', {
          jobId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        pollState.inFlight = false;
      }
    };

    const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);
    pollState.timer = intervalId;
    poll();

    return () => {
      if (TRACE) console.log('[TRACE] cleanup: clearing interval');
      window.clearInterval(intervalId);
      if (pollState.timer === intervalId) {
        pollState.timer = undefined;
      }
    };
  }, [activeTripId, dispatch, latestGenerate, tripIdFromPath]);

  return null;
}
