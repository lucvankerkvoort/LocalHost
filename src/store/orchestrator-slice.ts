import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type OrchestratorJobStatus = 'draft' | 'running' | 'complete' | 'error';
type OrchestratorJobStage = 'draft' | 'geocoding' | 'routing' | 'hosts' | 'final' | 'complete' | 'error';

export type OrchestratorJobState = {
  id: string;
  status: OrchestratorJobStatus;
  stage: OrchestratorJobStage;
  message: string;
  current?: number;
  total?: number;
  startedAt: number;
  updatedAt: number;
  error?: string;
};

interface OrchestratorState {
  activeJobId: string | null;
  jobs: Record<string, OrchestratorJobState>;
}

const initialState: OrchestratorState = {
  activeJobId: null,
  jobs: {},
};

const orchestratorSlice = createSlice({
  name: 'orchestrator',
  initialState,
  reducers: {
    jobStarted(
      state,
      action: PayloadAction<{
        id: string;
        stage: OrchestratorJobStage;
        message: string;
        current?: number;
        total?: number;
      }>
    ) {
      const now = Date.now();
      state.activeJobId = action.payload.id;
      state.jobs[action.payload.id] = {
        id: action.payload.id,
        status: 'draft',
        stage: action.payload.stage,
        message: action.payload.message,
        current: action.payload.current,
        total: action.payload.total,
        startedAt: now,
        updatedAt: now,
      };
    },
    jobProgress(
      state,
      action: PayloadAction<{
        id: string;
        stage: OrchestratorJobStage;
        message: string;
        current?: number;
        total?: number;
      }>
    ) {
      const job = state.jobs[action.payload.id];
      if (!job) return;
      job.status = 'running';
      job.stage = action.payload.stage;
      job.message = action.payload.message;
      job.current = action.payload.current;
      job.total = action.payload.total;
      job.updatedAt = Date.now();
    },
    jobCompleted(state, action: PayloadAction<{ id: string }>) {
      const job = state.jobs[action.payload.id];
      if (!job) return;
      job.status = 'complete';
      job.stage = 'complete';
      job.message = 'Plan ready';
      job.updatedAt = Date.now();
      state.activeJobId = null;
    },
    jobFailed(state, action: PayloadAction<{ id: string; error: string }>) {
      const job = state.jobs[action.payload.id];
      if (!job) return;
      job.status = 'error';
      job.stage = 'error';
      job.message = action.payload.error;
      job.error = action.payload.error;
      job.updatedAt = Date.now();
      state.activeJobId = null;
    },
    clearJobs(state) {
      state.activeJobId = null;
      state.jobs = {};
    },
  },
});

export const { jobStarted, jobProgress, jobCompleted, jobFailed, clearJobs } =
  orchestratorSlice.actions;

export default orchestratorSlice.reducer;
