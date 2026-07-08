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
import { CREDIT_PACK_PRODUCTS, FREE_EXPORT_LIMIT, PRO_PRODUCT_IDS } from "./constants";
import { isKVConfigured, VercelKVQuotaStore } from "./kv-quota-store";
import { loadTrustedRootsFromEnv, verifyAppStoreJWS } from "./app-store-jws";
import { consumeCredit, getCreditBalance, grantCredits, type GrantResult } from "./credit-store";
import { isValidUserId } from "./user-id";

/**
 * A StoreKit 2 signed transaction is a compact 3-part JWS — comfortably under this bound in
 * practice. Reject anything larger BEFORE the ES256 verify (Track H2 input bounds): a hostile
 * client cannot make us burn crypto work on a multi-megabyte payload, and the CPU cost of the
 * verify stays bounded regardless of what the wire sends.
 */
export const MAX_SIGNED_TRANSACTION_CHARS = 20_000;

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
 * Returns the configured quota store. Uses Vercel KV when KV_REST_API_URL and
 * KV_REST_API_TOKEN are set (owner-provisioned via Vercel KV integration); falls back to
 * in-memory otherwise so the gate functions locally and in tests without any KV setup.
 */
export function getQuotaStore(): QuotaStore {
  if (!defaultStore) {
    defaultStore = isKVConfigured() ? new VercelKVQuotaStore() : new InMemoryQuotaStore();
  }
  return defaultStore;
}

/**
 * Server-side Pro entitlement check. NEVER trusts a client-supplied "isPro" flag.
 *
 * Cryptographically verifies the StoreKit 2 signed transaction (JWS) the client passes up: the
 * x5c certificate chain must anchor to Apple's trusted root CA and the ES256 signature must be
 * valid (see app-store-jws.ts), then the decoded transaction must be one of our Pro SKUs, not
 * expired and not revoked. Apple's PUBLIC root CA is owner-supplied via APP_STORE_ROOT_CA_PEM
 * (like the API keys — see REMAINING_STEPS.md); with no trusted root configured this returns
 * false, the SECURE default (everyone free-tier, monthly limit enforced for all). The client
 * can never shortcut this: forging Pro would require forging Apple's signature.
 */
export async function verifyProEntitlement(signedTransaction?: string | null): Promise<boolean> {
  if (!signedTransaction || typeof signedTransaction !== "string") return false;
  if (signedTransaction.length > MAX_SIGNED_TRANSACTION_CHARS) return false; // H2: bound before verify

  const trustedRootDer = loadTrustedRootsFromEnv();
  if (trustedRootDer.length === 0) return false; // no trusted Apple root configured → deny

  const txn = verifyAppStoreJWS(signedTransaction, { trustedRootDer });
  if (!txn) return false;

  // The verified transaction must be for one of our Pro subscription products.
  if (!txn.productId || !(PRO_PRODUCT_IDS as readonly string[]).includes(txn.productId)) {
    return false;
  }
  // If we know our bundle id, it must match — and a transaction that omits it is rejected
  // (defence-in-depth against a transaction minted for another app).
  const expectedBundleId = process.env.APP_STORE_BUNDLE_ID;
  if (expectedBundleId && txn.bundleId !== expectedBundleId) return false;
  // Our Pro SKUs are auto-renewable subscriptions: a non-expired expiresDate is REQUIRED.
  // Treat a missing expiresDate as not-entitled rather than as never-expiring.
  if (typeof txn.expiresDate !== "number" || txn.expiresDate <= Date.now()) return false;
  // A refunded / revoked purchase grants nothing.
  if (typeof txn.revocationDate === "number") return false;

  return true;
}

export interface ExportDecision {
  allowed: boolean;
  isPro: boolean;
  /** Remaining free runs this month; -1 means unlimited (Pro). */
  remaining: number;
  limit: number;
  used: number;
  reason?: string;
  /** True when the export is authorized by a purchased credit (monthly free quota exhausted). */
  viaCredit?: boolean;
  /** Spendable credit balance when this export is credit-authorized (else omitted). */
  creditsRemaining?: number;
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
  if (!isValidUserId(userId)) {
    // H2: reject a missing OR over-long userId before it becomes a KV key suffix (fail closed).
    return { allowed: false, isPro: false, remaining: 0, limit: FREE_EXPORT_LIMIT, used: 0, reason: "missing userId" };
  }
  if (await verifyProEntitlement(signedTransaction)) {
    return { allowed: true, isPro: true, remaining: -1, limit: FREE_EXPORT_LIMIT, used: 0 };
  }
  let used: number;
  try {
    used = await store.get(userId, currentPeriodKey(now));
  } catch (err) {
    // Quota store (KV) transient failure → fail CLOSED: never start a paid run we cannot
    // account for (Track H — protect the wallet over availability on the paid path). Pro
    // users already returned above, so this only briefly defers FREE-tier exports during an
    // outage; the route surfaces a clean retryable error instead of an uncaught 500.
    console.error("[entitlement] quota store read failed; failing closed:", err);
    return {
      allowed: false,
      isPro: false,
      remaining: 0,
      limit: FREE_EXPORT_LIMIT,
      used: 0,
      reason: "quota check unavailable",
    };
  }
  if (used < FREE_EXPORT_LIMIT) {
    return {
      allowed: true,
      isPro: false,
      remaining: Math.max(0, FREE_EXPORT_LIMIT - used),
      limit: FREE_EXPORT_LIMIT,
      used,
    };
  }

  // Free monthly quota exhausted → fall back to purchased export credits (lever b). Only reached
  // once a user is over the free limit, so the extra KV read never touches the common under-limit
  // path. Fails CLOSED like the quota read: never authorize a paid run on an unverifiable balance.
  let credits: number;
  try {
    credits = await getCreditBalance(userId);
  } catch (err) {
    console.error("[entitlement] credit balance read failed; failing closed:", err);
    return { allowed: false, isPro: false, remaining: 0, limit: FREE_EXPORT_LIMIT, used, reason: "quota check unavailable" };
  }
  if (credits > 0) {
    return {
      allowed: true,
      isPro: false,
      remaining: 0,
      limit: FREE_EXPORT_LIMIT,
      used,
      viaCredit: true,
      creditsRemaining: credits,
    };
  }
  return {
    allowed: false,
    isPro: false,
    remaining: 0,
    limit: FREE_EXPORT_LIMIT,
    used,
    reason: "free monthly limit reached",
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
  // H2: never derive a KV key from an invalid/over-long userId (defence-in-depth — the paid path
  // always validates via checkExportAllowed first, but consumeExport must not trust that).
  if (!isValidUserId(userId)) return 0;
  const period = currentPeriodKey(now);

  // Decide free-quota vs purchased-credit the same way checkExportAllowed did: while under the
  // free monthly limit, consume free quota; once exhausted, this export was credit-authorized, so
  // spend one credit instead of bumping the (already-maxed) monthly counter.
  let used: number;
  try {
    used = await store.get(userId, period);
  } catch (err) {
    // Can't tell which bucket to charge → best-effort bump the monthly counter (the historical
    // behavior) rather than silently spend a credit we can't confirm the user needed.
    console.error("[entitlement] quota read failed on consume; bumping monthly best-effort:", err);
    used = 0;
  }

  if (used < FREE_EXPORT_LIMIT) {
    try {
      return await store.increment(userId, period);
    } catch (err) {
      // The paid run ALREADY completed when we reach here. A store-write failure must NOT turn
      // a delivered export into a 500 (that would lose the result the user already paid COGS for
      // and invite a double-spend on retry). Log and report best-effort; the per-user daily spend
      // ceiling (independent of this monthly counter) still backstops abuse during a store outage.
      console.error("[entitlement] quota store write failed; export delivered but not counted:", err);
      return FREE_EXPORT_LIMIT;
    }
  }

  // Monthly free quota exhausted → charge one purchased export credit. Best-effort for the same
  // reason as above: the export already succeeded, so a KV blip here must not 500 the user.
  try {
    await consumeCredit(userId);
  } catch (err) {
    console.error("[entitlement] credit spend failed; export delivered but credit not charged:", err);
  }
  return FREE_EXPORT_LIMIT;
}

export interface RedeemResult {
  ok: boolean;
  granted: number;
  balance: number;
  /** True when this transaction was already redeemed (idempotent replay) — grant is 0. */
  duplicate?: boolean;
  reason?: string;
}

/**
 * Redeem a StoreKit consumable "export credit pack" purchase (business-case lever b).
 *
 * Cryptographically verifies the signed transaction (same Apple-anchored JWS path as Pro),
 * confirms the product is a known credit pack (CREDIT_PACK_PRODUCTS is the server-side source of
 * truth for the credit COUNT), rejects refunded purchases, and idempotently grants the credits
 * keyed on the Apple transactionId — a replayed transaction can NEVER mint credits twice. Like
 * verifyProEntitlement, this trusts nothing the client asserts beyond Apple's signature.
 *
 * Consumables carry no expiresDate, so (unlike the Pro subscription check) there is no expiry
 * window to validate — a consumable purchase is permanent once made.
 */
export async function redeemCreditPack(opts: {
  userId: string;
  signedTransaction?: string | null;
}): Promise<RedeemResult> {
  const { userId, signedTransaction } = opts;
  if (!isValidUserId(userId)) {
    // H2: reject a missing OR over-long userId before it becomes a credit-balance KV key.
    return { ok: false, granted: 0, balance: 0, reason: "missing userId" };
  }
  if (!signedTransaction || typeof signedTransaction !== "string") {
    return { ok: false, granted: 0, balance: 0, reason: "missing signedTransaction" };
  }
  if (signedTransaction.length > MAX_SIGNED_TRANSACTION_CHARS) {
    // H2: bound the JWS before the ES256 verify — same wallet-of-CPU guard as verifyProEntitlement.
    return { ok: false, granted: 0, balance: 0, reason: "invalid transaction" };
  }

  const trustedRootDer = loadTrustedRootsFromEnv();
  if (trustedRootDer.length === 0) {
    // No trusted Apple root configured → cannot verify → grant nothing (secure default).
    return { ok: false, granted: 0, balance: 0, reason: "purchase verification unavailable" };
  }

  const txn = verifyAppStoreJWS(signedTransaction, { trustedRootDer });
  if (!txn) return { ok: false, granted: 0, balance: 0, reason: "invalid transaction" };

  const amount = txn.productId ? CREDIT_PACK_PRODUCTS[txn.productId] : undefined;
  if (!amount) return { ok: false, granted: 0, balance: 0, reason: "not a credit-pack product" };

  // Defence-in-depth: reject a transaction minted for another app when we know our bundle id.
  const expectedBundleId = process.env.APP_STORE_BUNDLE_ID;
  if (expectedBundleId && txn.bundleId !== expectedBundleId) {
    return { ok: false, granted: 0, balance: 0, reason: "invalid transaction" };
  }
  // A refunded / revoked purchase grants nothing.
  if (typeof txn.revocationDate === "number") {
    return { ok: false, granted: 0, balance: 0, reason: "purchase refunded" };
  }
  // The transactionId is the idempotency key; without it we cannot guard against replay.
  if (!txn.transactionId || typeof txn.transactionId !== "string") {
    return { ok: false, granted: 0, balance: 0, reason: "invalid transaction" };
  }

  let result: GrantResult;
  try {
    result = await grantCredits(userId, amount, txn.transactionId);
  } catch (err) {
    console.error("[entitlement] credit grant failed:", err);
    return { ok: false, granted: 0, balance: 0, reason: "credit store unavailable" };
  }
  return { ok: true, granted: result.granted, balance: result.balance, duplicate: result.duplicate };
}
