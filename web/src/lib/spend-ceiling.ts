/**
 * Code-level per-user DAILY spend ceilings — Track H7 (ROADMAP).
 *
 * Two independent COGS circuit-breakers, both per-user / per-day, both applying to ALL tiers
 * (Pro included). They are a backstop the provider-level spend cap cannot replace (the
 * provider cap is per-business, not per-user) and the rate limiter cannot replace (the rate
 * limiter is per-IP and resets every minute, so an attacker with a valid userId who rotates
 * IPs can still drain the wallet over a day).
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
 * CROSS-INSTANCE (Track H): the ceiling store is Vercel-KV-backed (atomic INCR + a 2-day
 * EXPIRE on the per-day key) so the cap holds across Vercel's serverless fan-out — an
 * attacker who rotates IPs AND lands on different function instances is still bounded by ONE
 * shared per-user counter. It falls back to an in-memory store when KV env vars are absent
 * (local dev + tests), exactly like kv-quota-store.ts. KV errors FAIL CLOSED on the gate
 * (no paid call on an unverifiable ceiling), consistent with the entitlement quota gate.
 *
 * WINDOW: the bucket is a UTC CALENDAR DAY (YYYY-MM-DD), not a rolling 24h window. A calendar
 * bucket is what lets the counter be a single atomic KV INCR (a rolling window cannot be
 * enforced atomically across instances). The tradeoff is a reset at 00:00 UTC, so a burst
 * straddling midnight can reach up to ~2× the cap — bounded and rare given the caps sit well
 * above legitimate use; the cross-instance closure it buys far outweighs it. Matches the
 * calendar-month design of the monthly quota (entitlement.ts).
 *
 * Preflight asserts: `grep -rqiE 'spend.?ceiling|daily.?cap|usage.?cap' web/src/lib`
 */
import { isKVConfigured, KV_OP_TIMEOUT_MS } from "./kv-quota-store";

/** Maximum paid exports per user per day. Applies to ALL tiers including Pro. */
export const DAILY_EXPORT_CAP = 50;

/**
 * Maximum individual paid generation sub-calls per user per day. Applies to ALL tiers
 * including Pro. Headroom: ~DAILY_EXPORT_CAP exports × ~10 paid calls/export = 500.
 */
export const DAILY_GENERATION_CAP = 500;

/** Two-day TTL on each per-day key so buckets self-clean in KV (yesterday's expires). */
const KEY_TTL_SECONDS = 2 * 24 * 60 * 60;

type CeilingKind = "export" | "gen";

/** Current UTC calendar-day key, e.g. "2026-07-01". Ceilings reset at 00:00 UTC. */
export function dailyPeriodKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Per-user, per-day ceiling store. Implementations must be safe under concurrency (the KV
 * one uses atomic INCR). `get`/`increment` may reject on a backend error; callers translate
 * that into a fail-closed gate.
 */
interface DailyCeilingStore {
  get(kind: CeilingKind, userId: string, period: string): Promise<number>;
  /** Atomically increment and return the new value; sets a TTL on the first write of the day. */
  increment(kind: CeilingKind, userId: string, period: string): Promise<number>;
}

/**
 * Process-memory store. Correct for a single instance and for tests. NOT durable across
 * instances/restarts — production uses the KV store below so the ceiling holds across
 * Vercel's serverless fan-out.
 */
class InMemoryDailyCeilingStore implements DailyCeilingStore {
  private counts = new Map<string, number>();
  private key(kind: CeilingKind, userId: string, period: string): string {
    return `${kind}:${period}:${userId}`;
  }
  async get(kind: CeilingKind, userId: string, period: string): Promise<number> {
    return this.counts.get(this.key(kind, userId, period)) ?? 0;
  }
  async increment(kind: CeilingKind, userId: string, period: string): Promise<number> {
    const k = this.key(kind, userId, period);
    const next = (this.counts.get(k) ?? 0) + 1;
    this.counts.set(k, next);
    return next;
  }
}

/**
 * A hung KV op must surface as a fast, catchable rejection — never sit and burn the whole
 * serverless budget. Mirrors kv-quota-store.ts (timeout well under the shortest paid-route
 * budget); the gate catches the rejection and fails closed.
 */
function withTimeout<T>(op: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`KV ceiling ${label} timed out after ${KV_OP_TIMEOUT_MS}ms`)),
      KV_OP_TIMEOUT_MS,
    );
  });
  return Promise.race([op, timeout]).finally(() => clearTimeout(timer));
}

/** Vercel-KV store. Key format: "spend:{kind}:{period}:{userId}" e.g. "spend:gen:2026-07-01:u1". */
class VercelKVDailyCeilingStore implements DailyCeilingStore {
  private kvKey(kind: CeilingKind, userId: string, period: string): string {
    return `spend:${kind}:${period}:${userId}`;
  }
  async get(kind: CeilingKind, userId: string, period: string): Promise<number> {
    const { kv } = await import("@vercel/kv");
    const val = await withTimeout(kv.get<number>(this.kvKey(kind, userId, period)), "get");
    return val ?? 0;
  }
  async increment(kind: CeilingKind, userId: string, period: string): Promise<number> {
    const { kv } = await import("@vercel/kv");
    const key = this.kvKey(kind, userId, period);
    const next = await withTimeout(kv.incr(key), "incr");
    // Set the TTL once, on the first write of the day, so an actively-hammered key still
    // expires ~2 days after the day it belongs to rather than living forever. Best-effort:
    // the INCR already durably bumped the count, so a transient EXPIRE hiccup must NOT reject
    // the whole increment (that would fail the caller closed → a spurious 429 on a legit
    // user's first call of the day). Worst case the key just lacks a TTL for one day.
    if (next === 1) {
      try {
        await withTimeout(kv.expire(key, KEY_TTL_SECONDS), "expire");
      } catch {
        // ignore — TTL is a cleanup nicety, not a correctness requirement
      }
    }
    return next;
  }
}

let store: DailyCeilingStore | null = null;
function getStore(): DailyCeilingStore {
  if (!store) {
    store = isKVConfigured() ? new VercelKVDailyCeilingStore() : new InMemoryDailyCeilingStore();
  }
  return store;
}

/** Test-only: reset the module store so a suite can force a fresh in-memory instance. */
export function __resetCeilingStoreForTests(): void {
  store = null;
}

interface CeilingResult {
  allowed: boolean;
  usage: number;
  cap: number;
}

/** Check whether `userId` has hit the daily EXPORT ceiling. Call BEFORE the paid API call. */
export async function checkDailySpendCeiling(userId: string): Promise<CeilingResult> {
  try {
    const usage = await getStore().get("export", userId, dailyPeriodKey());
    return { allowed: usage < DAILY_EXPORT_CAP, usage, cap: DAILY_EXPORT_CAP };
  } catch {
    // Fail closed: an unverifiable ceiling must not authorize a paid export.
    return { allowed: false, usage: DAILY_EXPORT_CAP, cap: DAILY_EXPORT_CAP };
  }
}

/** Record one successful export against the daily ceiling. Call AFTER consumeExport. */
export async function recordDailyExport(userId: string): Promise<void> {
  try {
    await getStore().increment("export", userId, dailyPeriodKey());
  } catch {
    // Best-effort: the export already succeeded; a KV blip here must not 500 the user. The
    // authoritative gate is the fail-closed check ABOVE, run before the paid call.
  }
}

/**
 * Check whether `userId` has hit the daily paid-GENERATION ceiling. Call BEFORE the paid call.
 */
export async function checkDailyGenerationCeiling(userId: string): Promise<CeilingResult> {
  try {
    const usage = await getStore().get("gen", userId, dailyPeriodKey());
    return { allowed: usage < DAILY_GENERATION_CAP, usage, cap: DAILY_GENERATION_CAP };
  } catch {
    return { allowed: false, usage: DAILY_GENERATION_CAP, cap: DAILY_GENERATION_CAP };
  }
}

/** Record one paid generation sub-call against the daily generation ceiling. */
export async function recordDailyGeneration(userId: string): Promise<number> {
  return getStore().increment("gen", userId, dailyPeriodKey());
}

/**
 * Enforce the per-user daily generation ceiling on a paid sub-call route. Counts at admission
 * (atomically INCRs BEFORE firing the paid call) so a call that reaches the provider but then
 * fails still counts toward the cap — the protective choice for a wallet-drain backstop — and
 * so two concurrent calls at the boundary cannot both slip through (no check-then-act race).
 *
 * Returns a 429 Response to return immediately when the ceiling is hit (or when KV is
 * unverifiable — fail closed), or `null` to proceed. Mirrors `rateLimitResponse(...)`.
 */
export async function enforceGenerationCeiling(userId: string): Promise<Response | null> {
  let count: number;
  try {
    count = await getStore().increment("gen", userId, dailyPeriodKey());
  } catch {
    // Fail closed: cannot verify the ceiling → do not fire the paid call.
    return ceilingResponse();
  }
  if (count > DAILY_GENERATION_CAP) {
    return ceilingResponse();
  }
  return null;
}

function ceilingResponse(): Response {
  return Response.json(
    { error: "Daily generation limit reached. Please try again tomorrow." },
    { status: 429 },
  );
}
