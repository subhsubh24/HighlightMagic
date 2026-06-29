"use client";

/**
 * Batched Atlas Cloud poll manager.
 *
 * Instead of N concurrent `setInterval` loops each hitting `/api/animate/check`
 * independently (10 photos = 120 requests/min), this manager collects all
 * pending prediction IDs and checks them in a single batched request every
 * POLL_INTERVAL_MS. Individual callers get a Promise that resolves when their
 * specific task completes, fails, or times out.
 *
 * This reduces HTTP requests by ~90% for concurrent animation/upscale tasks.
 */

const POLL_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 600_000; // 10 min — headroom for large animation batches

interface Waiter {
  resolve: (url: string) => void;
  reject: (err: Error) => void;
}

interface PendingTask {
  predictionId: string;
  // Every caller that registered this predictionId gets its own waiter.
  // Settling fans out to ALL of them — no shared callback mutation/chaining.
  waiters: Waiter[];
  deadline: number;
  consecutiveErrors: number;
  maxErrors: number;
}

// Resolve/reject every waiter on a task exactly once.
function settleResolve(task: PendingTask, url: string) {
  for (const w of task.waiters) w.resolve(url);
}
function settleReject(task: PendingTask, err: Error) {
  for (const w of task.waiters) w.reject(err);
}

let pendingTasks: Map<string, PendingTask> = new Map();
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function tick() {
  if (pendingTasks.size === 0) {
    // No tasks — stop polling
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    return;
  }

  const now = Date.now();

  // Check for timeouts first
  for (const [id, task] of pendingTasks) {
    if (now >= task.deadline) {
      pendingTasks.delete(id);
      settleReject(task, new Error(`Poll timeout for ${id}`));
    }
  }

  if (pendingTasks.size === 0) return;

  // Batch check — fire all checks concurrently in a single wave
  // (The server endpoint only accepts one predictionId at a time,
  //  but we batch the client-side scheduling into one tick.)
  const ids = Array.from(pendingTasks.keys());
  const results = await Promise.allSettled(
    ids.map(async (predictionId) => {
      const res = await fetch("/api/animate/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predictionId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { predictionId, data: await res.json() };
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { predictionId, data } = result.value;
      const task = pendingTasks.get(predictionId);
      if (!task) continue;

      // Reset error counter on success
      task.consecutiveErrors = 0;

      if (data.status === "completed" && data.videoUrl) {
        pendingTasks.delete(predictionId);
        settleResolve(task, data.videoUrl);
      } else if (data.status === "failed") {
        pendingTasks.delete(predictionId);
        settleReject(task, new Error(data.error || "Task failed"));
      }
      // "processing" — keep in the map for next tick
    } else {
      // Network/parse error — increment consecutive error counter
      // Extract predictionId from the original ids array by index
      const idx = results.indexOf(result);
      const predictionId = ids[idx];
      const task = pendingTasks.get(predictionId);
      if (task) {
        task.consecutiveErrors++;
        if (task.consecutiveErrors >= task.maxErrors) {
          pendingTasks.delete(predictionId);
          settleReject(task, new Error(`Too many consecutive poll errors for ${predictionId}`));
        }
      }
    }
  }
}

function ensurePolling() {
  if (pollTimer === null) {
    pollTimer = setInterval(tick, POLL_INTERVAL_MS);
  }
}

/**
 * Register a prediction ID for batched polling.
 * Returns a promise that resolves with the output URL on completion,
 * or rejects on failure/timeout.
 */
export function pollBatched(
  predictionId: string,
  options?: { timeoutMs?: number; maxErrors?: number }
): Promise<string> {
  // If already being polled, piggyback by appending a waiter — never mutate
  // a shared resolve/reject pair (that chained callbacks and was order-fragile).
  const existing = pendingTasks.get(predictionId);
  if (existing) {
    // Extend deadline to whichever caller has the longer timeout
    const newDeadline = Date.now() + (options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    existing.deadline = Math.max(existing.deadline, newDeadline);
    return new Promise<string>((resolve, reject) => {
      existing.waiters.push({ resolve, reject });
    });
  }

  return new Promise<string>((resolve, reject) => {
    pendingTasks.set(predictionId, {
      predictionId,
      waiters: [{ resolve, reject }],
      deadline: Date.now() + (options?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      consecutiveErrors: 0,
      maxErrors: options?.maxErrors ?? 5,
    });
    ensurePolling();
  });
}

/**
 * Cancel polling for a specific prediction ID.
 * The associated promise is rejected with a cancellation error.
 */
export function cancelPoll(predictionId: string) {
  const task = pendingTasks.get(predictionId);
  if (task) {
    pendingTasks.delete(predictionId);
    settleReject(task, new Error(`Polling cancelled for ${predictionId}`));
  }
}

/**
 * Cancel all pending polls (e.g., on unmount).
 */
export function cancelAllPolls() {
  for (const task of pendingTasks.values()) {
    settleReject(task, new Error("Polling cancelled"));
  }
  pendingTasks.clear();
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
