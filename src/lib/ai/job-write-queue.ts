import { updateOrchestratorJob, type OrchestratorJobUpdateResult } from './orchestrator-jobs';

type JobUpdate = Parameters<typeof updateOrchestratorJob>[1];

/**
 * Per-job serialized write queue with latest-wins batching.
 *
 * Ensures only one DB write is in-flight per job at any time.
 * If multiple progress updates queue up while a write is in-flight,
 * only the latest one is written (counters are monotonically increasing).
 *
 * Usage:
 *   queue.enqueue(jobId, updates)   — fire-and-forget, safe
 *   await queue.flush(jobId, updates) — drains queue + writes final update
 */
class JobWriteQueue {
  private pending = new Map<string, JobUpdate>();
  private inFlight = new Set<string>();
  private drainPromises = new Map<string, { resolve: () => void; promise: Promise<void> }>();

  /**
   * Enqueue a progress update. Non-blocking.
   * If a write is in-flight, stores the update as pending (latest-wins).
   * If no write is in-flight, writes immediately.
   */
  enqueue(jobId: string, updates: JobUpdate): void {
    this.pending.set(jobId, updates);
    void this.processNext(jobId);
  }

  /**
   * Drain all pending writes for a job, then write the final update.
   * Returns a promise that resolves only when the final write lands.
   * This guarantees no stale writes can arrive after the returned promise resolves.
   */
  async flush(jobId: string, finalUpdate: JobUpdate): Promise<OrchestratorJobUpdateResult> {
    // Wait for any in-flight write to finish
    await this.waitForDrain(jobId);

    // Discard any stale pending update — the final update supersedes everything
    this.pending.delete(jobId);

    // Write the final update directly (no queue) — we're guaranteed nothing else is in-flight
    return updateOrchestratorJob(jobId, finalUpdate);
  }

  private async processNext(jobId: string): Promise<void> {
    if (this.inFlight.has(jobId)) return;

    const update = this.pending.get(jobId);
    if (!update) {
      // Nothing pending — resolve any drain waiters
      this.resolveDrain(jobId);
      return;
    }

    this.pending.delete(jobId);
    this.inFlight.add(jobId);

    try {
      await updateOrchestratorJob(jobId, update);
    } catch (error) {
      console.warn(`[JobWriteQueue] Write failed for job ${jobId}:`, error);
    } finally {
      this.inFlight.delete(jobId);
      // Process the next pending update (if any arrived while we were writing)
      void this.processNext(jobId);
    }
  }

  private waitForDrain(jobId: string): Promise<void> {
    if (!this.inFlight.has(jobId) && !this.pending.has(jobId)) {
      return Promise.resolve();
    }

    const existing = this.drainPromises.get(jobId);
    if (existing) return existing.promise;

    let resolve!: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    this.drainPromises.set(jobId, { resolve, promise });
    return promise;
  }

  private resolveDrain(jobId: string): void {
    const waiter = this.drainPromises.get(jobId);
    if (waiter) {
      this.drainPromises.delete(jobId);
      waiter.resolve();
    }
  }
}

/** Singleton write queue for orchestrator job updates */
export const jobWriteQueue = new JobWriteQueue();
