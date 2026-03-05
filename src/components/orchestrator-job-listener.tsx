'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { jobStarted, jobProgress, jobCompleted, jobFailed } from '@/store/orchestrator-slice';
import { recordToolResult } from '@/lib/ai/tool-events';
import type { ItineraryPlan } from '@/lib/ai/types';
import { getTripIdFromPath } from '@/components/features/chat-widget-handshake';

const POLL_INTERVAL_MS = 1500;
const DEBUG_ORCHESTRATOR_LISTENER = process.env.NEXT_PUBLIC_DEBUG_ORCHESTRATOR_PROGRESS === '1';

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

  // References to keep polling loop independent of frequent re-renders
  const jobStateRef = useRef<{
    jobId?: string;
    generationId?: string;
    timer?: number;
    inFlight?: boolean;
    abortController?: AbortController;
  }>({});

  const appliedRef = useRef<Record<string, { draft?: string; complete?: string; started?: string }>>({});

  // Keep latest context available to the async poll interval without causing re-renders
  const contextRef = useRef({
    dispatch,
    tripIdFromPath,
    activeTripId,
  });
  useEffect(() => {
    contextRef.current = { dispatch, tripIdFromPath, activeTripId };
  }, [dispatch, tripIdFromPath, activeTripId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const state = jobStateRef.current;
      if (state.timer) {
        window.clearInterval(state.timer);
      }
      if (state.abortController) {
        state.abortController.abort();
      }
    };
  }, []);

  useEffect(() => {
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

    const jobId = result?.jobId;
    const toolGenerationId = typeof result?.generationId === 'string' ? result.generationId : 'unknown';
    const jobTripId = resultTripId ?? contextRef.current.activeTripId ?? undefined;
    
    // Ensure we have a valid job
    if (!jobId) return;

    if (contextRef.current.tripIdFromPath) {
      if (!resultTripId || resultTripId !== contextRef.current.tripIdFromPath) {
        logOrchestratorListenerDebug('ignore.mismatched-trip-result', {
          routeTripId: contextRef.current.tripIdFromPath,
          resultTripId: resultTripId ?? null,
          latestJobId: jobId,
        });
        return;
      }
    }

    const state = jobStateRef.current;
    
    // Have we already fully completed this job for this generation?
    const jobRecord = appliedRef.current[jobId] = appliedRef.current[jobId] || {};
    if (jobRecord.complete === toolGenerationId) {
      return; 
    }

    // Is it already actively polling for this EXACT configuration?
    if (state.jobId === jobId && state.generationId === toolGenerationId && state.timer !== undefined) {
      return;
    }

    logOrchestratorListenerDebug('poll.start', {
      jobId,
      toolGenerationId,
      jobTripId: jobTripId ?? null,
    });

    // Tear down any previous polling config
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = undefined;
    }
    if (state.abortController) {
      state.abortController.abort();
    }

    // Set new polling configuration
    state.jobId = jobId;
    state.generationId = toolGenerationId;
    state.inFlight = false;
    state.abortController = new AbortController();

    // Dispatch job started if we haven't already for this generation
    if (jobRecord.started !== toolGenerationId) {
      jobRecord.started = toolGenerationId;
      dispatch(
        jobStarted({
          id: jobId,
          stage: 'draft',
          message: result?.message ?? 'Draft ready',
        })
      );
    }

    const poll = async () => {
      // Abort gracefully if polling configuration has moved on
      if (jobStateRef.current.jobId !== jobId || jobStateRef.current.generationId !== toolGenerationId) {
         return;
      }
      if (jobStateRef.current.inFlight) return;
      jobStateRef.current.inFlight = true;

      try {
        const response = await fetch(`/api/orchestrator?jobId=${encodeURIComponent(jobId)}`, {
          signal: jobStateRef.current.abortController?.signal
        });
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

        const jobGenId = typeof job.generationId === 'string' ? job.generationId : 'unknown';

        // Ignore stale backend responses if we are already expecting a newer generation
        // but the DB hasn't caught up yet.
        if (jobGenId !== toolGenerationId && jobRecord.complete === jobGenId) {
          logOrchestratorListenerDebug('poll.ignore-stale-generation', {
            jobId,
            expected: toolGenerationId,
            received: jobGenId,
          });
          return;
        }

        // Update tracking generation ID if backend advanced
        if (jobStateRef.current.generationId !== jobGenId) {
          logOrchestratorListenerDebug('poll.generation-advanced', {
            jobId,
            previous: jobStateRef.current.generationId,
            next: jobGenId,
          });
          jobStateRef.current.generationId = jobGenId;
          contextRef.current.dispatch(
            jobStarted({
              id: jobId,
              stage: 'draft',
              message: job.progress?.message ?? 'Drafting itinerary',
            })
          );
        }

        const contextStatus = jobRecord.complete;

        // Draft application
        if (
          job.plan &&
          job.status !== 'complete' &&
          jobRecord.draft !== jobGenId &&
          contextStatus !== jobGenId
        ) {
          logOrchestratorListenerDebug('apply.draft-plan', { jobId, genId: jobGenId });
          jobRecord.draft = jobGenId;
          recordToolResult(contextRef.current.dispatch, {
            toolName: 'generateItinerary',
            result: {
              success: true,
              jobId,
              plan: job.plan,
              hostMarkers: job.hostMarkers ?? [],
              tripId: jobTripId,
              generationId: jobGenId,
            },
            source: 'orchestrator',
          });
        }

        // Complete application
        if (job.status === 'complete' && job.plan) {
          if (contextStatus === jobGenId) {
             // Already done
             if (jobStateRef.current.timer === intervalId) {
               window.clearInterval(intervalId);
               jobStateRef.current.timer = undefined;
             }
             return;
          }

          logOrchestratorListenerDebug('apply.complete-plan', { jobId, genId: jobGenId });
          jobRecord.complete = jobGenId;
          contextRef.current.dispatch(jobCompleted({ id: jobId }));
          recordToolResult(contextRef.current.dispatch, {
            toolName: 'generateItinerary',
            result: {
              success: true,
              jobId,
              plan: job.plan,
              hostMarkers: job.hostMarkers ?? [],
              tripId: jobTripId,
              generationId: jobGenId,
            },
            source: 'orchestrator',
          });
          
          if (jobStateRef.current.timer === intervalId) {
             window.clearInterval(intervalId);
             jobStateRef.current.timer = undefined;
          }
          return;
        }

        // Error handling
        if (job.status === 'error') {
          logOrchestratorListenerDebug('poll.error-status', { jobId, genId: jobGenId });
          contextRef.current.dispatch(jobFailed({ id: jobId, error: job.error || 'Failed to build itinerary.' }));
          
          if (jobStateRef.current.timer === intervalId) {
             window.clearInterval(intervalId);
             jobStateRef.current.timer = undefined;
          }
          return;
        }

        // Progress updates
        if (job.progress) {
          const stage = job.progress.stage;
          const normalizedStage =
            ['draft', 'geocoding', 'routing', 'hosts', 'final', 'complete', 'error'].includes(stage ?? '')
              ? stage
              : 'geocoding';
          
          contextRef.current.dispatch(
            jobProgress({
              id: jobId,
              stage: normalizedStage as 'geocoding' | 'routing' | 'hosts' | 'final' | 'complete' | 'error' | 'draft',
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
      } finally {
        if (jobStateRef.current.jobId === jobId) {
           jobStateRef.current.inFlight = false;
        }
      }
    };

    const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);
    state.timer = intervalId;
    poll(); // Initial run

  }, [latestGenerate]); // ONLY trigger when latestGenerate changes, other values are read from refs

  return null;
}
