/**
 * Durable per-user EXPORT-CREDIT balance store (ROADMAP F / business-case lever b).
 *
 * Credits are a consumable revenue lever: a free user who has exhausted the monthly
 * {@link FREE_EXPORT_LIMIT} can buy an export-credit pack (see CREDIT_PACK_PRODUCTS) instead of
 * subscribing. Each purchased pack adds N credits; each credit buys ONE extra export. Unlike the
 * monthly quota, credits do NOT reset per calendar month — they are durable until spent, so the
 * balance key carries no period.
 *
 * Cross-instance (Track H): Vercel-KV-backed (atomic INCRBY/DECR for the balance; SET NX for the
 * redemption idempotency marker) so a balance and its grants hold across Vercel's serverless
 * fan-out. Falls back to an in-memory store when KV env vars are absent (local dev + tests),
 * exactly like kv-quota-store.ts / spend-ceiling.ts. A KV error surfaces as a fast catchable
 * rejection (5s timeout) that callers translate into a fail-closed decision on the paid path.
 */
import { isKVConfigured, KV_OP_TIMEOUT_MS } from "./kv-quota-store";

/** Redemption idempotency markers live ~13 months so a replayed StoreKit txn can never re-grant. */
const REDEEM_MARKER_TTL_SECONDS = 400 * 24 * 60 * 60;

/** Result of a credit-pack redemption. `duplicate` = this transactionId was already redeemed. */
export interface GrantResult {
  granted: number;
  balance: number;
  duplicate: boolean;
}

/**
 * Durable per-user credit store. Implementations must be safe under concurrency (the KV one
 * uses atomic INCRBY/DECR and SET-NX). Methods may reject on a backend error; callers translate
 * that into a fail-closed gate on the paid path.
 */
interface CreditStore {
  /** Current spendable balance for `userId` (never negative). */
  getBalance(userId: string): Promise<number>;
  /**
   * Idempotently grant `amount` credits for a verified consumable `transactionId`. A replay of
   * the same transactionId is a no-op (returns duplicate=true) — the security-critical guard
   * against a client re-submitting one purchase to mint unlimited credits.
   */
  grant(userId: string, amount: number, transactionId: string): Promise<GrantResult>;
  /** Spend one credit. Returns the new balance (never negative). No-op at balance 0. */
  consumeOne(userId: string): Promise<number>;
}

/**
 * Process-memory store. Correct for a single instance and for tests. NOT durable across
 * instances/restarts — production uses the KV store below so credits hold across Vercel's fan-out.
 */
class InMemoryCreditStore implements CreditStore {
  private balances = new Map<string, number>();
  private redeemed = new Set<string>();

  async getBalance(userId: string): Promise<number> {
    return Math.max(0, this.balances.get(userId) ?? 0);
  }

  async grant(userId: string, amount: number, transactionId: string): Promise<GrantResult> {
    if (this.redeemed.has(transactionId)) {
      return { granted: 0, balance: await this.getBalance(userId), duplicate: true };
    }
    this.redeemed.add(transactionId);
    const balance = (this.balances.get(userId) ?? 0) + amount;
    this.balances.set(userId, balance);
    return { granted: amount, balance, duplicate: false };
  }

  async consumeOne(userId: string): Promise<number> {
    const current = Math.max(0, this.balances.get(userId) ?? 0);
    if (current <= 0) return 0;
    const next = current - 1;
    this.balances.set(userId, next);
    return next;
  }

  /** Test/maintenance helper: clear all balances + redemption markers. */
  reset(): void {
    this.balances.clear();
    this.redeemed.clear();
  }
}

/**
 * A hung KV op must surface as a fast, catchable rejection — never sit and burn the whole
 * serverless budget. Mirrors kv-quota-store.ts / spend-ceiling.ts (timeout well under the
 * shortest paid-route budget); the gate catches the rejection and fails closed.
 */
function withTimeout<T>(op: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`KV credit ${label} timed out after ${KV_OP_TIMEOUT_MS}ms`)),
      KV_OP_TIMEOUT_MS,
    );
  });
  return Promise.race([op, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Vercel-KV store. Keys:
 *  - "credits:{userId}"          → integer balance (durable, no period)
 *  - "credit-redeem:{txnId}"     → idempotency marker set once per redeemed transaction (SET NX)
 */
class VercelKVCreditStore implements CreditStore {
  private balanceKey(userId: string): string {
    return `credits:${userId}`;
  }
  private redeemKey(transactionId: string): string {
    return `credit-redeem:${transactionId}`;
  }

  async getBalance(userId: string): Promise<number> {
    const { kv } = await import("@vercel/kv");
    const val = await withTimeout(kv.get<number>(this.balanceKey(userId)), "get");
    return Math.max(0, val ?? 0);
  }

  async grant(userId: string, amount: number, transactionId: string): Promise<GrantResult> {
    const { kv } = await import("@vercel/kv");
    // Atomic idempotency: SET NX succeeds ("OK") only for the FIRST redemption of this txn; a
    // concurrent/replayed second attempt gets null and is refused a grant. This is the security
    // boundary — a client cannot re-post one consumable purchase to mint unlimited credits.
    const marked = await withTimeout(
      kv.set(this.redeemKey(transactionId), "1", { nx: true, ex: REDEEM_MARKER_TTL_SECONDS }),
      "set-nx",
    );
    if (marked !== "OK") {
      return { granted: 0, balance: await this.getBalance(userId), duplicate: true };
    }
    const balance = await withTimeout(kv.incrby(this.balanceKey(userId), amount), "incrby");
    return { granted: amount, balance: Math.max(0, balance), duplicate: false };
  }

  async consumeOne(userId: string): Promise<number> {
    const { kv } = await import("@vercel/kv");
    const next = await withTimeout(kv.decr(this.balanceKey(userId)), "decr");
    if (next < 0) {
      // A concurrent over-spend at the zero boundary can briefly dip negative. Clamp back to 0
      // best-effort so a later grant starts from a true balance, not a negative "hole".
      try {
        await withTimeout(kv.set(this.balanceKey(userId), 0), "clamp");
      } catch {
        // ignore — getBalance() floors reads at 0 regardless
      }
      return 0;
    }
    return next;
  }
}

let store: CreditStore | null = null;
function getStore(): CreditStore {
  if (!store) {
    store = isKVConfigured() ? new VercelKVCreditStore() : new InMemoryCreditStore();
  }
  return store;
}

/** Test-only: reset the module store so a suite can force a fresh in-memory instance. */
export function __resetCreditStoreForTests(): void {
  if (store instanceof InMemoryCreditStore) store.reset();
  store = null;
}

/** Current spendable credit balance for `userId` (0 on a KV read the caller can't complete). */
export function getCreditBalance(userId: string): Promise<number> {
  return getStore().getBalance(userId);
}

/** Idempotently grant a verified credit pack. See {@link CreditStore.grant}. */
export function grantCredits(
  userId: string,
  amount: number,
  transactionId: string,
): Promise<GrantResult> {
  return getStore().grant(userId, amount, transactionId);
}

/** Spend one export credit (called once per export, only after the monthly quota is exhausted). */
export function consumeCredit(userId: string): Promise<number> {
  return getStore().consumeOne(userId);
}
