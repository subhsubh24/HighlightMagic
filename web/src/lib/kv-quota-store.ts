/**
 * Vercel KV-backed quota store. Durable across serverless restarts and instances.
 *
 * Uses INCR (atomic) for increment — safe under concurrent Vercel function invocations.
 * Key format: "quota:{period}:{userId}" e.g. "quota:2026-06:user_abc123"
 *
 * Requires: KV_REST_API_URL + KV_REST_API_TOKEN (set by Vercel KV integration).
 * Falls back to InMemoryQuotaStore when env vars are absent (local dev + tests).
 *
 * Implements QuotaStore from entitlement.ts structurally (no import to avoid a circular dep).
 */

function kvKey(userId: string, period: string): string {
  return `quota:${period}:${userId}`;
}

/**
 * Hard ceiling on any single KV round-trip. A hung KV must surface as a fast, catchable
 * error — NOT sit and burn the function's whole serverless budget (the shortest paid-route
 * budget is 30s; this is well under it). The entitlement gate catches the rejection and
 * fails CLOSED on reads (no paid run on an unverifiable quota) per DEEP_DIAGNOSIS: every
 * external call needs a timeout shorter than the serverless budget.
 */
export const KV_OP_TIMEOUT_MS = 5_000;

function withTimeout<T>(op: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`KV ${label} timed out after ${KV_OP_TIMEOUT_MS}ms`)),
      KV_OP_TIMEOUT_MS,
    );
  });
  return Promise.race([op, timeout]).finally(() => clearTimeout(timer));
}

export class VercelKVQuotaStore {
  async get(userId: string, period: string): Promise<number> {
    const { kv } = await import("@vercel/kv");
    const val = await withTimeout(kv.get<number>(kvKey(userId, period)), "get");
    return val ?? 0;
  }

  async increment(userId: string, period: string): Promise<number> {
    const { kv } = await import("@vercel/kv");
    return withTimeout(kv.incr(kvKey(userId, period)), "incr");
  }
}

/**
 * Returns true when Vercel KV env vars are present, indicating the KV store is available.
 * This is checked once at cold-start by getQuotaStore() in entitlement.ts.
 */
export function isKVConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}
