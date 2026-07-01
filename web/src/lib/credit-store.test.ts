import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetCreditStoreForTests,
  consumeCredit,
  getCreditBalance,
  grantCredits,
} from "./credit-store";

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
