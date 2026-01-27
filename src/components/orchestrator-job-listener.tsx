'use client';

import { useEffect, useRef } from 'react';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { jobStarted, jobProgress, jobCompleted, jobFailed } from '@/store/orchestrator-slice';
import { recordToolResult } from '@/lib/ai/tool-events';

const POLL_INTERVAL_MS = 1500;

export function OrchestratorJobListener() {
  const dispatch = useAppDispatch();
  const latestGenerate = useAppSelector(
    (state) => state.toolCalls.lastResultsByTool.generateItinerary
  );
  const pollRef = useRef<{ jobId?: string; timer?: number; inFlight?: boolean }>({});

  useEffect(() => {
    const result = latestGenerate?.result as { jobId?: string; message?: string } | undefined;
    const jobId = result?.jobId;
    if (!jobId || pollRef.current.jobId === jobId) return;

    pollRef.current.jobId = jobId;

    dispatch(
      jobStarted({
        id: jobId,
        stage: 'draft',
        message: result?.message ?? 'Draft ready',
      })
    );

    const poll = async () => {
      if (pollRef.current.inFlight) return;
      pollRef.current.inFlight = true;

      try {
        const response = await fetch(`/api/orchestrator?jobId=${encodeURIComponent(jobId)}`);
        const data = await response.json();
        if (!response.ok || !data.success) {
          return;
        }

        const job = data.job as {
          status: 'draft' | 'running' | 'complete' | 'error';
          progress?: { stage?: string; message?: string; current?: number; total?: number };
          plan?: unknown;
          hostMarkers?: unknown;
          error?: string;
        };

        if (job.status === 'complete' && job.plan) {
          dispatch(jobCompleted({ id: jobId }));
          recordToolResult(dispatch, {
            toolName: 'generateItinerary',
            result: { success: true, plan: job.plan, hostMarkers: job.hostMarkers ?? [] },
            source: 'orchestrator',
          });
          window.clearInterval(intervalId);
          return;
        }

        if (job.status === 'error') {
          dispatch(jobFailed({ id: jobId, error: job.error || 'Failed to build itinerary.' }));
          window.clearInterval(intervalId);
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
        pollRef.current.inFlight = false;
      }
    };

    const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);
    pollRef.current.timer = intervalId;
    poll();

    return () => {
      window.clearInterval(intervalId);
    };
  }, [dispatch, latestGenerate]);

  return null;
}
