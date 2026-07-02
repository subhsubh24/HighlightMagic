import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @vercel/kv so the KV-backed store can be exercised without a real connection (mirrors
// kv-quota-store.test.ts). Harmless for the in-memory suite below, which never imports it.
const mockKv = {
  get: vi.fn<(key: string) => Promise<number | null>>(),
  set: vi.fn<(key: string, value: unknown, opts?: unknown) => Promise<string | null>>(),
  incrby: vi.fn<(key: string, amount: number) => Promise<number>>(),
  decr: vi.fn<(key: string) => Promise<number>>(),
};
vi.mock("@vercel/kv", () => ({ kv: mockKv }));

import {
  __resetCreditStoreForTests,
  consumeCredit,
  getCreditBalance,
  grantCredits,
} from "./credit-store";
import { KV_OP_TIMEOUT_MS } from "./kv-quota-store";

// No KV env vars in tests → the in-memory store is used (mirrors kv-quota-store.test.ts).
describe("credit-store (in-memory)", () => {
  beforeEach(() => __resetCreditStoreForTests());

  it("starts every user at a zero balance", async () => {
    expect(await getCreditBalance("u1")).toBe(0);
  });

  it("grants credits and reflects the new balance", async () => {
    const r = await grantCredits("u1", 10, "txn-1");
    expect(r).toEqual({ granted: 10, balance: 10, duplicate: false });
    expect(await getCreditBalance("u1")).toBe(10);
  });

  it("accumulates across multiple distinct transactions", async () => {
    await grantCredits("u1", 10, "txn-1");
    const r = await grantCredits("u1", 30, "txn-2");
    expect(r.granted).toBe(30);
    expect(r.balance).toBe(40);
    expect(await getCreditBalance("u1")).toBe(40);
  });

  it("is IDEMPOTENT: replaying the same transactionId grants nothing", async () => {
    await grantCredits("u1", 10, "txn-1");
    const replay = await grantCredits("u1", 10, "txn-1");
    expect(replay).toEqual({ granted: 0, balance: 10, duplicate: true });
    expect(await getCreditBalance("u1")).toBe(10); // not 20
  });

  it("keeps balances isolated per user", async () => {
    await grantCredits("u1", 10, "txn-1");
    expect(await getCreditBalance("u2")).toBe(0);
  });

  it("spends one credit at a time and floors at zero", async () => {
    await grantCredits("u1", 2, "txn-1");
    expect(await consumeCredit("u1")).toBe(1);
    expect(await consumeCredit("u1")).toBe(0);
    // Already at zero — consume is a no-op, never negative.
    expect(await consumeCredit("u1")).toBe(0);
    expect(await getCreditBalance("u1")).toBe(0);
  });

  it("a grant after depletion starts from the true (zero) balance", async () => {
    await grantCredits("u1", 1, "txn-1");
    await consumeCredit("u1");
    const r = await grantCredits("u1", 5, "txn-2");
    expect(r.balance).toBe(5);
  });
});

// ── VercelKVCreditStore (production path — durable, cross-instance) ──────────────
// The KV store carries the security-critical redemption-idempotency guard and the balance
// arithmetic that a client could otherwise abuse (replay one purchase to mint credits, or
// over-spend past zero). The in-memory suite above cannot exercise it, so mock @vercel/kv and
// force the KV store by stubbing the env vars isKVConfigured() reads.
describe("credit-store (Vercel KV)", () => {
  const REDEEM_TTL_SECONDS = 400 * 24 * 60 * 60;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("KV_REST_API_URL", "https://example.kv.vercel.app");
    vi.stubEnv("KV_REST_API_TOKEN", "tok_secret");
    __resetCreditStoreForTests(); // drop the memoized store so the next call builds the KV one
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetCreditStoreForTests();
  });

  it("grant: first redemption sets the NX idempotency marker with TTL, then increments the balance", async () => {
    mockKv.set.mockResolvedValue("OK");
    mockKv.incrby.mockResolvedValue(10);

    const r = await grantCredits("u1", 10, "txn-1");

    expect(mockKv.set).toHaveBeenCalledWith("credit-redeem:txn-1", "1", {
      nx: true,
      ex: REDEEM_TTL_SECONDS,
    });
    expect(mockKv.incrby).toHaveBeenCalledWith("credits:u1", 10);
    expect(r).toEqual({ granted: 10, balance: 10, duplicate: false });
  });

  it("grant: a replayed transactionId (NX fails) grants NOTHING — the anti-mint guard", async () => {
    mockKv.set.mockResolvedValue(null); // SET NX refused: marker already exists
    mockKv.get.mockResolvedValue(10);

    const r = await grantCredits("u1", 10, "txn-1");

    expect(mockKv.incrby).not.toHaveBeenCalled(); // balance never bumped on a replay
    expect(r).toEqual({ granted: 0, balance: 10, duplicate: true });
  });

  it("getBalance: floors a null read and a negative balance at 0, else returns the stored value", async () => {
    mockKv.get.mockResolvedValueOnce(null);
    expect(await getCreditBalance("u1")).toBe(0);

    mockKv.get.mockResolvedValueOnce(7);
    expect(await getCreditBalance("u1")).toBe(7);

    mockKv.get.mockResolvedValueOnce(-3);
    expect(await getCreditBalance("u1")).toBe(0);

    expect(mockKv.get).toHaveBeenCalledWith("credits:u1");
  });

  it("consumeOne: returns the atomically-decremented balance", async () => {
    mockKv.decr.mockResolvedValue(4);
    expect(await consumeCredit("u1")).toBe(4);
    expect(mockKv.decr).toHaveBeenCalledWith("credits:u1");
  });

  it("consumeOne: clamps a negative decr back to 0 (concurrent over-spend at the zero boundary)", async () => {
    mockKv.decr.mockResolvedValue(-1);
    mockKv.set.mockResolvedValue("OK");

    expect(await consumeCredit("u1")).toBe(0);
    expect(mockKv.set).toHaveBeenCalledWith("credits:u1", 0); // best-effort clamp so no negative "hole"
  });

  it("consumeOne: still returns 0 when the clamp SET itself fails (reads floor at 0 regardless)", async () => {
    mockKv.decr.mockResolvedValue(-2);
    mockKv.set.mockRejectedValue(new Error("kv down"));

    expect(await consumeCredit("u1")).toBe(0);
  });

  it("a hung KV op rejects via the timeout so the caller can fail closed (never burns the budget)", async () => {
    vi.useFakeTimers();
    mockKv.get.mockReturnValue(new Promise<number | null>(() => {})); // never resolves

    const pending = getCreditBalance("u1");
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(KV_OP_TIMEOUT_MS + 10);
    await assertion;

    vi.useRealTimers();
  });
});
