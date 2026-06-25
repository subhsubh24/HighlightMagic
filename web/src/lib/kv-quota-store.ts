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

export class VercelKVQuotaStore {
  async get(userId: string, period: string): Promise<number> {
    const { kv } = await import("@vercel/kv");
    const val = await kv.get<number>(kvKey(userId, period));
    return val ?? 0;
  }

  async increment(userId: string, period: string): Promise<number> {
    const { kv } = await import("@vercel/kv");
    const next = await kv.incr(kvKey(userId, period));
    return next;
  }
}

/**
 * Returns true when Vercel KV env vars are present, indicating the KV store is available.
 * This is checked once at cold-start by getQuotaStore() in entitlement.ts.
 */
export function isKVConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}
