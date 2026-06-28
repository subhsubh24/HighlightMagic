/**
 * Code-level per-user DAILY spend ceilings — Track H7 (ROADMAP).
 *
 * Two independent COGS circuit-breakers, both per-user / 24h, both applying to ALL tiers
 * (Pro included). They are a backstop the provider-level spend cap cannot replace (the
 * provider cap is per-business, not per-user) and the rate limiter cannot replace (the rate
 * limiter is per-IP and resets every minute, so an attacker with a valid userId who rotates
 * IPs can still drain the wallet over a day). The in-memory implementation is correct for
 * single-instance and dev; for cross-instance enforcement pair with KV (same pattern as
 * kv-quota-store.ts).
 *
 *  - DAILY_EXPORT_CAP        — caps completed EXPORTS (metered once, at /api/score|ios-score).
 *  - DAILY_GENERATION_CAP    — caps individual paid GENERATION sub-calls (intro/outro/sfx/
 *    voiceover/music/animate/upscale/thumbnail/style-transfer/talking-head/voice-clone/plan/
 *    validate, …). A single export fans out into many such calls, and every one of those
 *    routes is INDEPENDENTLY reachable while NOT consuming the monthly export quota (that is
 *    metered once at /api/score). Without this cap a single authenticated userId could hammer
 *    e.g. /api/animate (Kling video) or /api/intro far beyond their export quota and drain the
 *    wallet. Set comfortably above legitimate heavy use (~DAILY_EXPORT_CAP exports × the paid
 *    calls each export fans out into) so it only trips on abuse, not real usage.
 *
 * Preflight asserts: `grep -rqiE 'spend.?ceiling|daily.?cap|usage.?cap' web/src/lib`
 */

/** Maximum paid exports per user per 24-hour window. Applies to ALL tiers including Pro. */
export const DAILY_EXPORT_CAP = 50;

/**
 * Maximum individual paid generation sub-calls per user per 24-hour window. Applies to ALL
 * tiers including Pro. Headroom: ~DAILY_EXPORT_CAP exports × ~10 paid calls/export = 500.
 */
export const DAILY_GENERATION_CAP = 500;

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DailyRecord {
  count: number;
  windowStart: number;
}

const exportUsage = new Map<string, DailyRecord>();
const generationUsage = new Map<string, DailyRecord>();

function checkCeiling(
  store: Map<string, DailyRecord>,
  userId: string,
  cap: number,
): { allowed: boolean; usage: number; cap: number } {
  const now = Date.now();
  const rec = store.get(userId);

  if (!rec || now - rec.windowStart >= WINDOW_MS) {
    return { allowed: true, usage: 0, cap };
  }

  return { allowed: rec.count < cap, usage: rec.count, cap };
}

function recordCeiling(store: Map<string, DailyRecord>, userId: string): void {
  const now = Date.now();
  const rec = store.get(userId);

  if (!rec || now - rec.windowStart >= WINDOW_MS) {
    store.set(userId, { count: 1, windowStart: now });
  } else {
    rec.count += 1;
  }
}

/** Check whether `userId` has hit the daily EXPORT ceiling. Call BEFORE the paid API call. */
export function checkDailySpendCeiling(userId: string): {
  allowed: boolean;
  usage: number;
  cap: number;
} {
  return checkCeiling(exportUsage, userId, DAILY_EXPORT_CAP);
}

/** Record one successful export against the daily ceiling. Call AFTER consumeExport. */
export function recordDailyExport(userId: string): void {
  recordCeiling(exportUsage, userId);
}

/**
 * Check whether `userId` has hit the daily paid-GENERATION ceiling. Call BEFORE the paid call.
 */
export function checkDailyGenerationCeiling(userId: string): {
  allowed: boolean;
  usage: number;
  cap: number;
} {
  return checkCeiling(generationUsage, userId, DAILY_GENERATION_CAP);
}

/** Record one paid generation sub-call against the daily generation ceiling. */
export function recordDailyGeneration(userId: string): void {
  recordCeiling(generationUsage, userId);
}

/**
 * Enforce the per-user daily generation ceiling on a paid sub-call route. Counts at admission
 * (records BEFORE firing the paid call) so a call that reaches the provider but then fails
 * still counts toward the cap — that is the protective choice for a wallet-drain backstop.
 *
 * Returns a 429 Response to return immediately when the ceiling is hit, or `null` to proceed.
 * Mirrors the `rateLimitResponse(...)` ergonomics in rate-limit.ts.
 */
export function enforceGenerationCeiling(userId: string): Response | null {
  const ceiling = checkDailyGenerationCeiling(userId);
  if (!ceiling.allowed) {
    return Response.json(
      { error: "Daily generation limit reached. Please try again tomorrow." },
      { status: 429 },
    );
  }
  recordDailyGeneration(userId);
  return null;
}
