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

const PENDING_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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
    await kv.sadd("waitlist:emails", email);
    await kv.set(`waitlist:pending:${token}`, email, { ex: PENDING_TTL_SECONDS });
  } else {
    memEmails.add(email);
    memPending.set(token, email);
  }
  return token;
}

/**
 * Confirm a pending token. Returns the confirmed email, or null when the token is
 * unknown/expired. Idempotent: confirming an already-confirmed email is a safe no-op.
 */
export async function confirmSignup(token: string): Promise<string | null> {
  if (!token || typeof token !== "string") return null;
  if (isWaitlistStoreConfigured()) {
    const { kv } = await import("@vercel/kv");
    const email = await kv.get<string>(`waitlist:pending:${token}`);
    if (!email) return null;
    await kv.sadd("waitlist:confirmed", email);
    await kv.del(`waitlist:pending:${token}`);
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
      kv.scard("waitlist:emails"),
      kv.scard("waitlist:confirmed"),
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
