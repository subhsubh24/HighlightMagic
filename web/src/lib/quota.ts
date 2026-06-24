/**
 * Server-side export quota enforcement via Vercel KV (Upstash Redis REST API).
 *
 * When KV_REST_API_URL + KV_REST_API_TOKEN are set, reads and writes quota counters.
 * When KV is not configured, fails open (returns allowed=true) so builds and dev work
 * without requiring KV provisioning. The owner sets these env vars to activate enforcement.
 *
 * Key pattern : quota:{userId}:{YYYY-MM}  (31-day TTL, resets each calendar month)
 * Free limit  : FREE_EXPORT_LIMIT exports per user per month
 *               (matches Constants.freeExportLimit on iOS + FREE_EXPORT_LIMIT on web)
 */

export const FREE_EXPORT_LIMIT = 5;

function kvBaseUrl(): string | undefined {
  return process.env.KV_REST_API_URL;
}

function kvToken(): string | undefined {
  return process.env.KV_REST_API_TOKEN;
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function quotaKey(userId: string, month: string): string {
  return `quota:${userId}:${month}`;
}

export interface QuotaStatus {
  allowed: boolean;
  used: number;
  limit: number;
}

/**
 * Check whether userId has remaining exports for the current calendar month.
 * Returns { allowed: true } when KV is not configured (graceful degradation).
 */
export async function checkQuota(userId: string): Promise<QuotaStatus> {
  const base = kvBaseUrl();
  const token = kvToken();

  if (!base || !token) {
    return { allowed: true, used: 0, limit: FREE_EXPORT_LIMIT };
  }

  const month = currentYearMonth();
  const key = quotaKey(userId, month);

  try {
    const res = await fetch(`${base}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!res.ok) {
      return { allowed: true, used: 0, limit: FREE_EXPORT_LIMIT };
    }

    const data = (await res.json()) as { result: string | null };
    const used = data.result != null ? Number(data.result) : 0;
    return { allowed: used < FREE_EXPORT_LIMIT, used, limit: FREE_EXPORT_LIMIT };
  } catch {
    // KV unavailable — fail open so users are never blocked by infrastructure errors
    return { allowed: true, used: 0, limit: FREE_EXPORT_LIMIT };
  }
}

/**
 * Atomically increment the export counter for userId in the current month.
 * Uses a Redis pipeline: INCR + EXPIRE in one round-trip.
 * The EXPIRE sets a 31-day TTL on first write so the key self-expires each month.
 * No-op when KV is not configured.
 */
export async function incrementQuota(userId: string): Promise<void> {
  const base = kvBaseUrl();
  const token = kvToken();

  if (!base || !token) return;

  const month = currentYearMonth();
  const key = quotaKey(userId, month);
  const ttlSeconds = 31 * 24 * 3600;

  try {
    await fetch(`${base}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, ttlSeconds],
      ]),
    });
  } catch {
    // Non-fatal: quota increment failure does not block the export
  }
}
