import { describe, it, expect, vi, beforeEach } from "vitest";
import { FREE_EXPORT_LIMIT } from "./constants";

/**
 * Credit-STORE outage resilience for the entitlement paid path.
 *
 * entitlement.test.ts already covers a QUOTA-store outage, but its `throwingStore` throws on the
 * FIRST quota read — so checkExportAllowed/consumeExport bail before ever reaching the purchased-
 * credit fallback (only reached once a user is OVER the free monthly limit). That leaves the
 * credit-store failure branches — the ones that decide whether a KV blip on the CREDIT ledger
 * fails open (wallet drain) or closed — untested. These are the Track-H fail-closed guarantees:
 *   - checkExportAllowed: getCreditBalance() throws  → fail CLOSED (never authorize on an
 *     unverifiable balance), NOT an uncaught 500.
 *   - consumeExport:      consumeCredit() throws      → best-effort (the paid run already
 *     happened; a store blip must not 500 and re-bill on retry), NOT an uncaught throw.
 *
 * We mock ./credit-store so those calls can fail, and drive a quota store that reports the user
 * already AT the free limit so control flow reaches the credit branch.
 */

vi.mock("./credit-store", () => ({
  getCreditBalance: vi.fn(),
  consumeCredit: vi.fn(),
  grantCredits: vi.fn(),
}));

import { checkExportAllowed, consumeExport, currentPeriodKey } from "./entitlement";
import { getCreditBalance, consumeCredit } from "./credit-store";

// A quota store that reports the user is already AT the free monthly limit, so both functions fall
// through to the purchased-credit path (get succeeds; increment would only run under the limit).
const atLimitStore = {
  async get(): Promise<number> {
    return FREE_EXPORT_LIMIT;
  },
  async increment(): Promise<number> {
    return FREE_EXPORT_LIMIT + 1;
  },
};

const mockedGetCreditBalance = vi.mocked(getCreditBalance);
const mockedConsumeCredit = vi.mocked(consumeCredit);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("credit-store outage resilience (checkExportAllowed)", () => {
  it("fails CLOSED for an over-limit free user when the credit balance read throws", async () => {
    mockedGetCreditBalance.mockRejectedValueOnce(new Error("KV unreachable"));
    const d = await checkExportAllowed({ userId: "u1", store: atLimitStore });
    // Never authorize a paid run against a balance we cannot verify (Track H — protect the wallet).
    expect(d.allowed).toBe(false);
    expect(d.isPro).toBe(false);
    expect(d.viaCredit).toBeUndefined();
    expect(d.reason).toBe("quota check unavailable");
  });

  it("does NOT throw when the credit balance read throws (no uncaught 500 on the paid path)", async () => {
    mockedGetCreditBalance.mockRejectedValueOnce(new Error("KV unreachable"));
    await expect(
      checkExportAllowed({ userId: "u1", store: atLimitStore }),
    ).resolves.toBeDefined();
  });

  it("authorizes viaCredit when the balance read SUCCEEDS with credits (control: fail-closed is throw-specific)", async () => {
    mockedGetCreditBalance.mockResolvedValueOnce(3);
    const d = await checkExportAllowed({ userId: "u1", store: atLimitStore });
    expect(d.allowed).toBe(true);
    expect(d.viaCredit).toBe(true);
    expect(d.creditsRemaining).toBe(3);
  });

  it("does not touch the credit store at all while the user is UNDER the free limit", async () => {
    const underStore = { async get() { return 0; }, async increment() { return 1; } };
    const d = await checkExportAllowed({ userId: "u1", store: underStore });
    expect(d.allowed).toBe(true);
    expect(d.viaCredit).toBeUndefined();
    expect(mockedGetCreditBalance).not.toHaveBeenCalled();
  });
});

describe("credit-store outage resilience (consumeExport)", () => {
  it("swallows a credit-spend failure — a delivered export must not 500 or double-charge on retry", async () => {
    mockedConsumeCredit.mockRejectedValueOnce(new Error("KV unreachable"));
    // The paid run already completed; recording the spend must not throw.
    await expect(
      consumeExport({ userId: "u1", store: atLimitStore }),
    ).resolves.toBe(FREE_EXPORT_LIMIT);
    // It genuinely reached the credit-spend path (not the monthly-increment path).
    expect(mockedConsumeCredit).toHaveBeenCalledWith("u1");
  });

  it("spends exactly one credit (not the monthly counter) once the free quota is exhausted", async () => {
    mockedConsumeCredit.mockResolvedValueOnce(undefined);
    const incSpy = vi.spyOn(atLimitStore, "increment");
    await consumeExport({ userId: "u1", store: atLimitStore });
    expect(mockedConsumeCredit).toHaveBeenCalledTimes(1);
    expect(incSpy).not.toHaveBeenCalled(); // the already-maxed monthly counter is left alone
    incSpy.mockRestore();
  });

  it("consumes free quota (never a credit) while the user is UNDER the free limit", async () => {
    const underStore = {
      async get() { return 2; },
      async increment() { return 3; },
    };
    const used = await consumeExport({ userId: "u2", store: underStore, now: new Date() });
    expect(used).toBe(3);
    expect(mockedConsumeCredit).not.toHaveBeenCalled();
  });

  it("stays a no-op for Pro even with the credit store present", async () => {
    expect(await consumeExport({ userId: "pro", isPro: true, store: atLimitStore })).toBe(0);
    expect(mockedConsumeCredit).not.toHaveBeenCalled();
  });
});

// Sanity: currentPeriodKey still resolves (imported alongside — keeps the mock module graph honest).
describe("period key under the mocked credit module", () => {
  it("returns a UTC year-month", () => {
    expect(currentPeriodKey(new Date("2026-07-09T00:00:00Z"))).toBe("2026-07");
  });
});
