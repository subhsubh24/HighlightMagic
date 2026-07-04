/**
 * E6a — Waitlist datastore (Growth Execution Engine).
 *
 * Durable, double-opt-in signup store backed by Vercel KV. Mirrors the kv-quota-store
 * pattern: dynamic `@vercel/kv` import, env-gated, falls back to an in-memory store when
 * KV is not configured (local dev + tests). Until KV creds are present the store is
 * DRY-RUN — signups are kept only in-process and counts reflect that.
 *
 * Data model (Redis):
 *   waitlist:emails           Set  — every email that ever submitted (raw signups)
 *   waitlist:confirmed        Set  — emails that completed double-opt-in
 *   waitlist:pending:{token}  Str  — token -> email, TTL 7 days (awaiting confirmation)
 */

import { KV_OP_TIMEOUT_MS } from "../kv-quota-store";

const PENDING_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * A hung KV op must surface as a fast, catchable rejection — never sit idle and burn the whole
 * serverless budget until Vercel hard-kills the function (the waitlist route's maxDuration is far
 * longer than this). Mirrors credit-store.ts / kv-quota-store.ts: the timeout is well under the
 * route budget; the caller catches the rejection and returns a clean "try again" instead of hanging.
 */
function withTimeout<T>(op: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`KV waitlist ${label} timed out after ${KV_OP_TIMEOUT_MS}ms`)),
      KV_OP_TIMEOUT_MS,
    );
  });
  return Promise.race([op, timeout]).finally(() => clearTimeout(timer));
}

export interface WaitlistCounts {
  /** Total distinct emails that submitted the form. */
  signups: number;
  /** Emails that completed double-opt-in confirmation. */
  confirmed: number;
}

export function isWaitlistStoreConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

// ── In-memory fallback (single-instance; resets on cold start) ──────────────────────────
const memEmails = new Set<string>();
const memConfirmed = new Set<string>();
const memPending = new Map<string, string>();

/**
 * Record a new signup as pending confirmation and return its opt-in token.
 * Adds the email to the raw-signups set immediately so visitor→signup funnel is real.
 */
export async function addPendingSignup(email: string): Promise<string> {
  const token = globalThis.crypto.randomUUID();
  if (isWaitlistStoreConfigured()) {
    const { kv } = await import("@vercel/kv");
    await withTimeout(kv.sadd("waitlist:emails", email), "sadd-pending");
    await withTimeout(
      kv.set(`waitlist:pending:${token}`, email, { ex: PENDING_TTL_SECONDS }),
      "set-pending",
    );
  } else {
    memEmails.add(email);
    memPending.set(token, email);
  }
  return token;
}

/**
 * DECISION COROLLARY: when the confirmation-email loop is NOT wired (no provider), do NOT gate
 * "on the list" on a send that can't happen — record the signup as CONFIRMED directly so the user
 * is never dead-ended awaiting an email that never sends. Double-opt-in (addPendingSignup + email)
 * is used ONLY when a real provider is configured.
 */
export async function addConfirmedSignup(email: string): Promise<void> {
  if (isWaitlistStoreConfigured()) {
    const { kv } = await import("@vercel/kv");
    await withTimeout(kv.sadd("waitlist:emails", email), "sadd-emails");
    await withTimeout(kv.sadd("waitlist:confirmed", email), "sadd-confirmed");
  } else {
    memEmails.add(email);
    memConfirmed.add(email);
  }
}

/**
 * Confirm a pending token. Returns the confirmed email, or null when the token is
 * unknown/expired. Idempotent: confirming an already-confirmed email is a safe no-op.
 */
export async function confirmSignup(token: string): Promise<string | null> {
  if (!token || typeof token !== "string") return null;
  if (isWaitlistStoreConfigured()) {
    const { kv } = await import("@vercel/kv");
    const email = await withTimeout(kv.get<string>(`waitlist:pending:${token}`), "get-pending");
    if (!email) return null;
    await withTimeout(kv.sadd("waitlist:confirmed", email), "sadd-confirmed");
    await withTimeout(kv.del(`waitlist:pending:${token}`), "del-pending");
    return email;
  }
  const email = memPending.get(token);
  if (!email) return null;
  memConfirmed.add(email);
  memPending.delete(token);
  return email;
}

/** Funnel counts for the analytics surface. Returns zeros in dry-run mode. */
export async function getWaitlistCounts(): Promise<WaitlistCounts> {
  if (isWaitlistStoreConfigured()) {
    const { kv } = await import("@vercel/kv");
    const [signups, confirmed] = await Promise.all([
      withTimeout(kv.scard("waitlist:emails"), "scard-emails"),
      withTimeout(kv.scard("waitlist:confirmed"), "scard-confirmed"),
    ]);
    return { signups: signups ?? 0, confirmed: confirmed ?? 0 };
  }
  return { signups: memEmails.size, confirmed: memConfirmed.size };
}

/** Test-only: clear the in-memory fallback between cases. */
export function _resetWaitlistMemory(): void {
  memEmails.clear();
  memConfirmed.clear();
  memPending.clear();
}
