import { describe, it, expect, beforeEach } from "vitest";
import { FREE_EXPORT_LIMIT } from "./constants";
import {
  currentPeriodKey,
  InMemoryQuotaStore,
  verifyProEntitlement,
  checkExportAllowed,
  consumeExport,
} from "./entitlement";

describe("currentPeriodKey", () => {
  it("formats UTC year-month", () => {
    expect(currentPeriodKey(new Date("2026-06-25T12:00:00Z"))).toBe("2026-06");
    expect(currentPeriodKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
    expect(currentPeriodKey(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });
});

describe("InMemoryQuotaStore", () => {
  it("starts at 0 and increments per user/period", async () => {
    const s = new InMemoryQuotaStore();
    expect(await s.get("u1", "2026-06")).toBe(0);
    expect(await s.increment("u1", "2026-06")).toBe(1);
    expect(await s.increment("u1", "2026-06")).toBe(2);
    expect(await s.get("u1", "2026-06")).toBe(2);
    // isolation across users and periods
    expect(await s.get("u2", "2026-06")).toBe(0);
    expect(await s.get("u1", "2026-07")).toBe(0);
  });
});

describe("verifyProEntitlement (never trusts the client)", () => {
  it("returns false with no transaction", async () => {
    expect(await verifyProEntitlement(undefined)).toBe(false);
    expect(await verifyProEntitlement(null)).toBe(false);
    expect(await verifyProEntitlement("")).toBe(false);
  });
  it("returns false (secure default) when App Store verification is not configured", async () => {
    // A client-supplied 'transaction' must NOT unlock Pro until server verification is wired.
    expect(await verifyProEntitlement("client-claims-pro")).toBe(false);
  });
});

describe("checkExportAllowed (free tier gate)", () => {
  let store: InMemoryQuotaStore;
  const now = new Date("2026-06-25T12:00:00Z");
  beforeEach(() => {
    store = new InMemoryQuotaStore();
  });

  it("denies a request with no userId", async () => {
    const d = await checkExportAllowed({ userId: "", store, now });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/userId/);
  });

  it("denies an over-long userId before it becomes a KV key (H2)", async () => {
    const d = await checkExportAllowed({ userId: "u".repeat(500), store, now });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/userId/);
    // fail closed: nothing was written for the pathological id
    expect(await store.get("u".repeat(500), currentPeriodKey(now))).toBe(0);
  });

  it("allows a fresh free user and reports remaining", async () => {
    const d = await checkExportAllowed({ userId: "u1", store, now });
    expect(d.allowed).toBe(true);
    expect(d.isPro).toBe(false);
    expect(d.used).toBe(0);
    expect(d.remaining).toBe(FREE_EXPORT_LIMIT);
  });

  it("denies once the monthly free limit is reached", async () => {
    for (let i = 0; i < FREE_EXPORT_LIMIT; i++) {
      const d = await checkExportAllowed({ userId: "u1", store, now });
      expect(d.allowed).toBe(true);
      await consumeExport({ userId: "u1", store, now });
    }
    const blocked = await checkExportAllowed({ userId: "u1", store, now });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.used).toBe(FREE_EXPORT_LIMIT);
    expect(blocked.reason).toMatch(/limit/i);
  });

  it("resets the quota in a new calendar month", async () => {
    for (let i = 0; i < FREE_EXPORT_LIMIT; i++) {
      await consumeExport({ userId: "u1", store, now });
    }
    expect((await checkExportAllowed({ userId: "u1", store, now })).allowed).toBe(false);
    const nextMonth = new Date("2026-07-01T00:00:00Z");
    const d = await checkExportAllowed({ userId: "u1", store, now: nextMonth });
    expect(d.allowed).toBe(true);
    expect(d.used).toBe(0);
  });
});

describe("consumeExport", () => {
  it("is a no-op for Pro users", async () => {
    const store = new InMemoryQuotaStore();
    expect(await consumeExport({ userId: "pro", isPro: true, store })).toBe(0);
    expect(await store.get("pro", currentPeriodKey())).toBe(0);
  });
  it("increments for free users", async () => {
    const store = new InMemoryQuotaStore();
    expect(await consumeExport({ userId: "free", store })).toBe(1);
  });
  it("is a no-op for an over-long userId — never writes a pathological KV key (H2)", async () => {
    const store = new InMemoryQuotaStore();
    const bad = "u".repeat(500);
    expect(await consumeExport({ userId: bad, store })).toBe(0);
    expect(await store.get(bad, currentPeriodKey())).toBe(0);
  });
});

describe("quota-store outage resilience (KV transient failure)", () => {
  // A store whose reads/writes always throw — models a Vercel KV blip in production.
  const throwingStore = {
    async get(): Promise<number> {
      throw new Error("KV unreachable");
    },
    async increment(): Promise<number> {
      throw new Error("KV unreachable");
    },
  };

  it("checkExportAllowed fails CLOSED for a free user when the store read throws", async () => {
    const d = await checkExportAllowed({ userId: "u1", store: throwingStore });
    expect(d.allowed).toBe(false); // never start a paid run on an unverifiable quota
    expect(d.isPro).toBe(false);
    expect(d.reason).toBe("quota check unavailable");
  });

  it("checkExportAllowed does NOT throw when the store read throws (no uncaught 500)", async () => {
    await expect(checkExportAllowed({ userId: "u1", store: throwingStore })).resolves.toBeDefined();
  });

  it("consumeExport swallows a store write failure (a delivered export must not 500)", async () => {
    // The paid run already happened; recording it must not throw and re-bill the user on retry.
    await expect(consumeExport({ userId: "u1", store: throwingStore })).resolves.toBeTypeOf("number");
  });

  it("consumeExport stays a no-op for Pro even if the store would throw", async () => {
    expect(await consumeExport({ userId: "pro", isPro: true, store: throwingStore })).toBe(0);
  });
});
