'use client';

import { useEffect, useRef } from 'react';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { jobStarted, jobProgress, jobCompleted, jobFailed } from '@/store/orchestrator-slice';
import { recordToolResult } from '@/lib/ai/tool-events';
import { saveTripPlanForTrip } from '@/store/globe-thunks';
import type { ItineraryPlan } from '@/lib/ai/types';

const POLL_INTERVAL_MS = 1500;

export function OrchestratorJobListener() {
  const dispatch = useAppDispatch();
  const latestGenerate = useAppSelector(
    (state) => state.toolCalls.lastResultsByTool.generateItinerary
  );
  const activeTripId = useAppSelector((state) => state.globe.tripId);
  const pollRef = useRef<{
    jobId?: string;
    generationId?: string;
    timer?: number;
    inFlight?: boolean;
  }>({});
  const draftAppliedRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const result = latestGenerate?.result as {
      jobId?: string;
      message?: string;
      tripId?: string;
      generationId?: string;
    } | undefined;
    const jobId = result?.jobId;
    const toolGenerationId =
      typeof result?.generationId === 'string' ? result.generationId : undefined;
    const jobTripId = result?.tripId ?? activeTripId ?? undefined;
    if (!jobId) return;
    const pollState = pollRef.current;
    const sameJob = pollState.jobId === jobId;
    const sameGeneration = toolGenerationId
      ? pollState.generationId === toolGenerationId
      : true;
    const hasActivePoll = typeof pollState.timer === 'number';
    if (sameJob && sameGeneration && hasActivePoll) return;

    pollState.jobId = jobId;
    if (toolGenerationId) {
      pollState.generationId = toolGenerationId;
    }

    dispatch(
      jobStarted({
        id: jobId,
        stage: 'draft',
        message: result?.message ?? 'Draft ready',
      })
    );

    const poll = async () => {
      if (pollState.inFlight) return;
      pollState.inFlight = true;

      try {
        const response = await fetch(`/api/orchestrator?jobId=${encodeURIComponent(jobId)}`);
        const data = await response.json();
        if (!response.ok || !data.success) {
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

        if (pollState.generationId !== jobGenerationId) {
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
          draftAppliedRef.current[jobId] = jobGenerationId;
          recordToolResult(dispatch, {
            toolName: 'generateItinerary',
            result: {
              success: true,
              plan: job.plan,
              hostMarkers: job.hostMarkers ?? [],
              tripId: jobTripId,
              generationId: jobGenerationId,
            },
            source: 'orchestrator',
          });
        }

        if (job.status === 'complete' && job.plan) {
          dispatch(jobCompleted({ id: jobId }));
          recordToolResult(dispatch, {
            toolName: 'generateItinerary',
            result: {
              success: true,
              plan: job.plan,
              hostMarkers: job.hostMarkers ?? [],
              tripId: jobTripId,
              generationId: jobGenerationId,
            },
            source: 'orchestrator',
          });
          if (jobTripId) {
            dispatch(saveTripPlanForTrip({ tripId: jobTripId, plan: job.plan as ItineraryPlan }));
          }
          window.clearInterval(intervalId);
          pollState.timer = undefined;
          return;
        }

        if (job.status === 'error') {
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
      } finally {
        pollState.inFlight = false;
      }
    };

    const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);
    pollState.timer = intervalId;
    poll();

    return () => {
      window.clearInterval(intervalId);
      if (pollState.timer === intervalId) {
        pollState.timer = undefined;
      }
    };
  }, [activeTripId, dispatch, latestGenerate]);

  return null;
}
