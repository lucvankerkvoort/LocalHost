type GenerationMode = 'draft' | 'refine';
type GenerationState = 'IDLE' | 'DRAFTING' | 'REFINING';

export type PlannerSnapshot = {
  request: string;
  createdAt: number;
};

export type GenerationTask<TSnapshot extends PlannerSnapshot> = {
  key: string;
  jobId: string;
  generationId: string;
  mode: GenerationMode;
  snapshot: TSnapshot;
  signal: AbortSignal;
  isLatest: () => boolean;
};

type GenerationRecord<TSnapshot extends PlannerSnapshot> = {
  state: GenerationState;
  activeJobId: string | null;
  currentGenerationId: string | null;
  inFlightAbortController: AbortController | null;
  currentSnapshot: TSnapshot | null;
  pendingSnapshot: TSnapshot | null;
  hasDraftCompleted: boolean;
  refineDebounceTimer: ReturnType<typeof setTimeout> | null;
};

export type ScheduleResult = {
  jobId: string;
  generationId: string | null;
  mode: GenerationMode;
  queued: boolean;
  state: GenerationState;
};

type GenerationControllerOptions<TSnapshot extends PlannerSnapshot> = {
  refineDebounceMs?: number;
  ensureJobId: (params: {
    key: string;
    existingJobId: string | null;
    snapshot: TSnapshot;
    mode: GenerationMode;
    generationId: string;
  }) => string | Promise<string>;
  onQueued?: (params: {
    key: string;
    jobId: string;
    generationId: string | null;
    snapshot: TSnapshot;
    mode: GenerationMode;
  }) => void | Promise<void>;
  runGeneration: (task: GenerationTask<TSnapshot>) => Promise<void>;
};

const DEFAULT_REFINEMENT_DEBOUNCE_MS = 600;

function createRecord<TSnapshot extends PlannerSnapshot>(): GenerationRecord<TSnapshot> {
  return {
    state: 'IDLE',
    activeJobId: null,
    currentGenerationId: null,
    inFlightAbortController: null,
    currentSnapshot: null,
    pendingSnapshot: null,
    hasDraftCompleted: false,
    refineDebounceTimer: null,
  };
}

export class GenerationController<TSnapshot extends PlannerSnapshot> {
  private readonly records = new Map<string, GenerationRecord<TSnapshot>>();
  private readonly refineDebounceMs: number;
  private readonly options: GenerationControllerOptions<TSnapshot>;

  constructor(options: GenerationControllerOptions<TSnapshot>) {
    this.options = options;
    this.refineDebounceMs = options.refineDebounceMs ?? DEFAULT_REFINEMENT_DEBOUNCE_MS;
  }

  async schedule(key: string, snapshot: TSnapshot): Promise<ScheduleResult> {
    const record = this.getOrCreateRecord(key);
    record.currentSnapshot = snapshot;
    const mode: GenerationMode = record.hasDraftCompleted ? 'refine' : 'draft';

    if (record.state === 'IDLE') {
      if (mode === 'draft') {
        // Await ensureJobId so the real jobId is in the result,
        // then fire-and-forget the actual generation.
        const generationId = crypto.randomUUID();
        const jobId = await this.options.ensureJobId({
          key,
          existingJobId: record.activeJobId,
          snapshot,
          mode,
          generationId,
        });
        record.activeJobId = jobId;
        record.currentGenerationId = generationId;
        // Fire-and-forget: the generation runs in the background
        void this.startGenerationNow(key, record, snapshot, mode, jobId, generationId);
        return this.toResult(record, mode, false, generationId);
      }

      record.pendingSnapshot = snapshot;
      record.state = 'REFINING';
      this.scheduleRefinementDebounce(key, record);
      return this.toResult(record, mode, true, record.currentGenerationId);
    }

    record.pendingSnapshot = snapshot;
    if (record.activeJobId) {
      void this.options.onQueued?.({
        key,
        jobId: record.activeJobId,
        generationId: record.currentGenerationId,
        snapshot,
        mode: 'refine',
      });
    }

    return this.toResult(record, 'refine', true, record.currentGenerationId);
  }

  getState(key: string) {
    const record = this.records.get(key);
    if (!record) return null;
    return {
      state: record.state,
      activeJobId: record.activeJobId,
      currentGenerationId: record.currentGenerationId,
      hasDraftCompleted: record.hasDraftCompleted,
      hasPendingSnapshot: record.pendingSnapshot !== null,
      hasInFlightRequest: record.inFlightAbortController !== null,
    };
  }

  cancel(key: string) {
    const record = this.records.get(key);
    if (!record) return;
    if (record.refineDebounceTimer) {
      clearTimeout(record.refineDebounceTimer);
      record.refineDebounceTimer = null;
    }
    if (record.inFlightAbortController) {
      record.inFlightAbortController.abort();
      record.inFlightAbortController = null;
    }
    record.currentGenerationId = null;
    record.pendingSnapshot = null;
    record.state = 'IDLE';
  }

  clear(key: string) {
    this.cancel(key);
    this.records.delete(key);
  }

  private getOrCreateRecord(key: string): GenerationRecord<TSnapshot> {
    const existing = this.records.get(key);
    if (existing) return existing;
    const created = createRecord<TSnapshot>();
    this.records.set(key, created);
    return created;
  }

  private toResult(
    record: GenerationRecord<TSnapshot>,
    mode: GenerationMode,
    queued: boolean,
    generationId: string | null
  ): ScheduleResult {
    return {
      jobId: record.activeJobId ?? 'pending',
      generationId,
      mode,
      queued,
      state: record.state,
    };
  }

  private scheduleRefinementDebounce(key: string, record: GenerationRecord<TSnapshot>) {
    if (record.refineDebounceTimer) {
      clearTimeout(record.refineDebounceTimer);
      record.refineDebounceTimer = null;
    }

    record.refineDebounceTimer = setTimeout(() => {
      record.refineDebounceTimer = null;
      const snapshot = record.pendingSnapshot ?? record.currentSnapshot;
      if (!snapshot) {
        record.state = 'IDLE';
        return;
      }
      record.pendingSnapshot = null;
      this.startGenerationNow(key, record, snapshot, 'refine');
    }, this.refineDebounceMs);
  }

  private async startGenerationNow(
    key: string,
    record: GenerationRecord<TSnapshot>,
    snapshot: TSnapshot,
    mode: GenerationMode,
    jobId?: string,
    generationId?: string
  ): Promise<void> {
    if (record.refineDebounceTimer) {
      clearTimeout(record.refineDebounceTimer);
      record.refineDebounceTimer = null;
    }

    if (record.inFlightAbortController) {
      record.inFlightAbortController.abort();
      record.inFlightAbortController = null;
    }

    const abortController = new AbortController();
    // Use pre-resolved values if provided (from schedule()),
    // otherwise resolve them here (from refinement debounce path)
    const resolvedGenerationId = generationId ?? crypto.randomUUID();
    const resolvedJobId = jobId ?? await this.options.ensureJobId({
      key,
      existingJobId: record.activeJobId,
      snapshot,
      mode,
      generationId: resolvedGenerationId,
    });

    record.activeJobId = resolvedJobId;
    record.currentGenerationId = resolvedGenerationId;
    record.inFlightAbortController = abortController;
    record.state = mode === 'draft' ? 'DRAFTING' : 'REFINING';
    record.currentSnapshot = snapshot;

    void this.runGeneration(key, record, {
      key,
      jobId: resolvedJobId,
      generationId: resolvedGenerationId,
      mode,
      snapshot,
      signal: abortController.signal,
      isLatest: () => {
        const latestRecord = this.records.get(key);
        return (
          latestRecord === record &&
          latestRecord?.currentGenerationId === resolvedGenerationId &&
          !abortController.signal.aborted
        );
      },
    });
  }

  private async runGeneration(
    key: string,
    record: GenerationRecord<TSnapshot>,
    task: GenerationTask<TSnapshot>
  ) {
    try {
      await this.options.runGeneration(task);
      if (task.mode === 'draft' && task.isLatest()) {
        record.hasDraftCompleted = true;
      }
    } finally {
      const latestRecord = this.records.get(key);
      if (latestRecord !== record) {
        return;
      }
      if (record.currentGenerationId !== task.generationId) {
        return;
      }

      record.inFlightAbortController = null;
      record.currentGenerationId = null;

      if (record.pendingSnapshot) {
        const nextSnapshot = record.pendingSnapshot;
        record.pendingSnapshot = null;
        record.state = 'REFINING';
        record.pendingSnapshot = nextSnapshot;
        this.scheduleRefinementDebounce(key, record);
      } else if (!record.refineDebounceTimer) {
        record.state = 'IDLE';
      }
    }
  }
}

export type {
  GenerationMode,
  GenerationState,
  GenerationControllerOptions,
};
