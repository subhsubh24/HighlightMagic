/**
 * Server-side entitlement + quota gate (ROADMAP P0).
 *
 * The freemium boundary is AUTHORITATIVE on the server: a tampered iOS client must NOT be
 * able to run up the API bill or bypass the free limit. Every paid pipeline call routes
 * through the backend and is gated here BEFORE any paid provider call.
 *
 * Model is BUSINESS-PAID (owner-decided 2026-06-25): the business holds the API keys and
 * pays the bills, so this gate is both a revenue boundary and a cost-control boundary.
 *
 * Free tier: FREE_EXPORT_LIMIT paid generation runs per user per calendar month.
 * Pro: unlimited — but ONLY when verified server-side (never from a client-supplied flag).
 */
import { FREE_EXPORT_LIMIT } from "./constants";

/** Current monthly period key in UTC, e.g. "2026-06". Quotas reset per calendar month. */
export function currentPeriodKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Per-user, per-month consumed-count store. Implementations must be safe under concurrency. */
export interface QuotaStore {
  /** Paid runs already consumed by `userId` in `period`. */
  get(userId: string, period: string): Promise<number>;
  /** Increment the count for (`userId`, `period`) and return the new value. */
  increment(userId: string, period: string): Promise<number>;
}

/**
 * Process-memory store. Correct for a single instance and for tests. NOT durable across
 * instances/restarts — production should use a KV-backed store (owner provisions KV; see
 * .env.example) so the limit holds across Vercel's serverless instances.
 */
export class InMemoryQuotaStore implements QuotaStore {
  private counts = new Map<string, number>();
  private key(userId: string, period: string): string {
    return `${period}:${userId}`;
  }
  async get(userId: string, period: string): Promise<number> {
    return this.counts.get(this.key(userId, period)) ?? 0;
  }
  async increment(userId: string, period: string): Promise<number> {
    const k = this.key(userId, period);
    const next = (this.counts.get(k) ?? 0) + 1;
    this.counts.set(k, next);
    return next;
  }
  /** Test/maintenance helper: clear all counts. */
  reset(): void {
    this.counts.clear();
  }
}

let defaultStore: QuotaStore | null = null;
/**
 * The configured quota store. TODO(P0): return a KV-backed store when the KV connection env
 * is present (owner-provisioned — see .env.example); falls back to in-memory otherwise so
 * the gate still functions locally and in tests.
 */
export function getQuotaStore(): QuotaStore {
  if (!defaultStore) defaultStore = new InMemoryQuotaStore();
  return defaultStore;
}

/**
 * Server-side Pro entitlement check. NEVER trusts a client-supplied "isPro" flag.
 *
 * Verifies an App Store Server API signed transaction (JWS). Until the verification creds
 * are configured (APP_STORE_* env — owner-provisioned, see .env.example) this returns false,
 * the SECURE default: everyone is treated as free-tier and the monthly limit is enforced for
 * all. Real JWS signature verification + transaction decode is the follow-on; it must never
 * be shortcut by trusting the client.
 */
export async function verifyProEntitlement(signedTransaction?: string | null): Promise<boolean> {
  if (!signedTransaction) return false;
  const configured =
    !!process.env.APP_STORE_ISSUER_ID &&
    !!process.env.APP_STORE_KEY_ID &&
    !!process.env.APP_STORE_PRIVATE_KEY;
  if (!configured) return false; // secure default until App Store Server verification is wired
  // TODO(P0): verify the JWS signature against Apple's keys, decode the signed transaction via
  // the App Store Server API, confirm the productId is the active Pro subscription and that it
  // is not expired/revoked. Until then, deny — never trust the client.
  return false;
}

export interface ExportDecision {
  allowed: boolean;
  isPro: boolean;
  /** Remaining free runs this month; -1 means unlimited (Pro). */
  remaining: number;
  limit: number;
  used: number;
  reason?: string;
}

/**
 * Authoritative pre-paid-call gate: may this user start a paid generation run right now?
 * Pro (server-verified) → always allowed. Free → allowed while under the monthly limit.
 * Does NOT consume quota; call consumeExport() after the paid run actually happens.
 */
export async function checkExportAllowed(opts: {
  userId: string;
  signedTransaction?: string | null;
  store?: QuotaStore;
  now?: Date;
}): Promise<ExportDecision> {
  const { userId, signedTransaction, store = getQuotaStore(), now = new Date() } = opts;
  if (!userId || typeof userId !== "string") {
    return { allowed: false, isPro: false, remaining: 0, limit: FREE_EXPORT_LIMIT, used: 0, reason: "missing userId" };
  }
  if (await verifyProEntitlement(signedTransaction)) {
    return { allowed: true, isPro: true, remaining: -1, limit: FREE_EXPORT_LIMIT, used: 0 };
  }
  const used = await store.get(userId, currentPeriodKey(now));
  const remaining = Math.max(0, FREE_EXPORT_LIMIT - used);
  return {
    allowed: used < FREE_EXPORT_LIMIT,
    isPro: false,
    remaining,
    limit: FREE_EXPORT_LIMIT,
    used,
    reason: used < FREE_EXPORT_LIMIT ? undefined : "free monthly limit reached",
  };
}

/**
 * Consume one unit of the user's monthly quota (no-op for Pro). Call AFTER a paid run
 * actually executed. Returns the new used count (0 for Pro).
 */
export async function consumeExport(opts: {
  userId: string;
  isPro?: boolean;
  store?: QuotaStore;
  now?: Date;
}): Promise<number> {
  const { userId, isPro = false, store = getQuotaStore(), now = new Date() } = opts;
  if (isPro) return 0;
  return store.increment(userId, currentPeriodKey(now));
}
