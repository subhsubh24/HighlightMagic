/**
 * Code-level per-user DAILY export ceiling — Track H7 (ROADMAP).
 *
 * A COGS circuit-breaker: even Pro subscribers are capped at DAILY_EXPORT_CAP exports in
 * any 24-hour window. This prevents runaway spend from abuse, bugs, or a compromised
 * account, and is a backstop the provider-level spend cap cannot replace (the provider cap
 * is per-business, not per-user). The in-memory implementation is correct for single-instance
 * and dev; for cross-instance enforcement pair with KV (same pattern as kv-quota-store.ts).
 *
 * Preflight asserts: `grep -rqiE 'spend.?ceiling|daily.?cap|usage.?cap' web/src/lib`
 */

/** Maximum paid exports per user per 24-hour window. Applies to ALL tiers including Pro. */
export const DAILY_EXPORT_CAP = 50;

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DailyRecord {
  count: number;
  windowStart: number;
}

const dailyUsage = new Map<string, DailyRecord>();

/** Check whether `userId` has hit the daily spend ceiling. Call BEFORE the paid API call. */
export function checkDailySpendCeiling(userId: string): {
  allowed: boolean;
  usage: number;
  cap: number;
} {
  const now = Date.now();
  const rec = dailyUsage.get(userId);

  if (!rec || now - rec.windowStart >= WINDOW_MS) {
    return { allowed: true, usage: 0, cap: DAILY_EXPORT_CAP };
  }

  return { allowed: rec.count < DAILY_EXPORT_CAP, usage: rec.count, cap: DAILY_EXPORT_CAP };
}

/** Record one successful export against the daily ceiling. Call AFTER consumeExport. */
export function recordDailyExport(userId: string): void {
  const now = Date.now();
  const rec = dailyUsage.get(userId);

  if (!rec || now - rec.windowStart >= WINDOW_MS) {
    dailyUsage.set(userId, { count: 1, windowStart: now });
  } else {
    rec.count += 1;
  }
}
