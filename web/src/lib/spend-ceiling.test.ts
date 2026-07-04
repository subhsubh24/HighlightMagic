import { describe, it, expect, vi, afterEach } from "vitest";

// Inert for every test that runs InMemory (KV env unset → @vercel/kv is never imported). The
// fail-closed suite below stubs the KV env vars so getStore() selects the KV store, which then
// imports THIS mock and rejects — proving the gate fails closed on a KV outage.
vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn().mockRejectedValue(new Error("KV down")),
    incr: vi.fn().mockRejectedValue(new Error("KV down")),
    expire: vi.fn().mockRejectedValue(new Error("KV down")),
  },
}));

import {
  checkDailySpendCeiling,
  recordDailyExport,
  DAILY_EXPORT_CAP,
  checkDailyGenerationCeiling,
  recordDailyGeneration,
  enforceGenerationCeiling,
  enforceGlobalGenerationCeiling,
  GLOBAL_STEMS_DAILY_CAP,
  DAILY_GENERATION_CAP,
  dailyPeriodKey,
  __resetCeilingStoreForTests,
} from "./spend-ceiling";
import { kv } from "@vercel/kv";
import { KV_OP_TIMEOUT_MS } from "./kv-quota-store";

// The file-wide @vercel/kv mock (top of file) exposes vi.fn()s we can re-program per test.
const mockKv = kv as unknown as {
  get: ReturnType<typeof vi.fn>;
  incr: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
};

function uniqueUser(): string {
  return `user-${Math.random().toString(36).slice(2)}`;
}

function uniqueBucket(): string {
  return `bucket-${Math.random().toString(36).slice(2)}`;
}

describe("dailyPeriodKey", () => {
  it("formats a UTC calendar-day bucket", () => {
    expect(dailyPeriodKey(new Date("2026-07-01T23:59:59.000Z"))).toBe("2026-07-01");
    // Just after midnight UTC is a NEW bucket (the reset boundary).
    expect(dailyPeriodKey(new Date("2026-07-02T00:00:00.000Z"))).toBe("2026-07-02");
  });
});

describe("checkDailySpendCeiling", () => {
  it("allows a first-time user", async () => {
    const result = await checkDailySpendCeiling(uniqueUser());
    expect(result.allowed).toBe(true);
    expect(result.usage).toBe(0);
    expect(result.cap).toBe(DAILY_EXPORT_CAP);
  });

  it("allows a user below the cap", async () => {
    const userId = uniqueUser();
    for (let i = 0; i < 3; i++) await recordDailyExport(userId);
    const result = await checkDailySpendCeiling(userId);
    expect(result.allowed).toBe(true);
    expect(result.usage).toBe(3);
  });

  it("blocks a user at the cap", async () => {
    const userId = uniqueUser();
    for (let i = 0; i < DAILY_EXPORT_CAP; i++) await recordDailyExport(userId);
    const result = await checkDailySpendCeiling(userId);
    expect(result.allowed).toBe(false);
    expect(result.usage).toBe(DAILY_EXPORT_CAP);
  });

  it("uses independent counters for different users", async () => {
    const userA = uniqueUser();
    const userB = uniqueUser();
    for (let i = 0; i < DAILY_EXPORT_CAP; i++) await recordDailyExport(userA);
    expect((await checkDailySpendCeiling(userA)).allowed).toBe(false);
    expect((await checkDailySpendCeiling(userB)).allowed).toBe(true);
  });
});

describe("recordDailyExport", () => {
  it("increments usage on successive calls", async () => {
    const userId = uniqueUser();
    await recordDailyExport(userId);
    await recordDailyExport(userId);
    expect((await checkDailySpendCeiling(userId)).usage).toBe(2);
  });

  it("does not throw for new users", async () => {
    await expect(recordDailyExport(uniqueUser())).resolves.not.toThrow();
  });
});

describe("checkDailyGenerationCeiling", () => {
  it("allows a first-time user with the generation cap", async () => {
    const result = await checkDailyGenerationCeiling(uniqueUser());
    expect(result.allowed).toBe(true);
    expect(result.usage).toBe(0);
    expect(result.cap).toBe(DAILY_GENERATION_CAP);
  });

  it("blocks a user at the generation cap", async () => {
    const userId = uniqueUser();
    for (let i = 0; i < DAILY_GENERATION_CAP; i++) await recordDailyGeneration(userId);
    const result = await checkDailyGenerationCeiling(userId);
    expect(result.allowed).toBe(false);
    expect(result.usage).toBe(DAILY_GENERATION_CAP);
  });

  it("is independent from the export ceiling (separate counters)", async () => {
    const userId = uniqueUser();
    for (let i = 0; i < DAILY_EXPORT_CAP; i++) await recordDailyExport(userId);
    // Exports maxed, but generations untouched.
    expect((await checkDailySpendCeiling(userId)).allowed).toBe(false);
    expect((await checkDailyGenerationCeiling(userId)).allowed).toBe(true);
    expect((await checkDailyGenerationCeiling(userId)).usage).toBe(0);
  });
});

describe("recordDailyGeneration", () => {
  it("returns the new atomic count", async () => {
    const userId = uniqueUser();
    expect(await recordDailyGeneration(userId)).toBe(1);
    expect(await recordDailyGeneration(userId)).toBe(2);
  });
});

describe("enforceGenerationCeiling", () => {
  it("returns null and records a call while under the cap", async () => {
    const userId = uniqueUser();
    const blocked = await enforceGenerationCeiling(userId);
    expect(blocked).toBeNull();
    expect((await checkDailyGenerationCeiling(userId)).usage).toBe(1);
  });

  it("counts at admission across repeated calls", async () => {
    const userId = uniqueUser();
    await enforceGenerationCeiling(userId);
    await enforceGenerationCeiling(userId);
    await enforceGenerationCeiling(userId);
    expect((await checkDailyGenerationCeiling(userId)).usage).toBe(3);
  });

  it("returns a 429 Response once the cap is reached", async () => {
    const userId = uniqueUser();
    for (let i = 0; i < DAILY_GENERATION_CAP; i++) {
      expect(await enforceGenerationCeiling(userId)).toBeNull();
    }
    const blocked = await enforceGenerationCeiling(userId);
    expect(blocked).toBeInstanceOf(Response);
    expect(blocked?.status).toBe(429);
    const body = await blocked?.json();
    expect(body.error).toMatch(/daily generation limit/i);
  });

  it("isolates the cap per user", async () => {
    const userA = uniqueUser();
    const userB = uniqueUser();
    for (let i = 0; i < DAILY_GENERATION_CAP; i++) await enforceGenerationCeiling(userA);
    expect(await enforceGenerationCeiling(userA)).toBeInstanceOf(Response);
    expect(await enforceGenerationCeiling(userB)).toBeNull();
  });
});

// The GLOBAL ceiling backstops an ANONYMOUS paid route (no userId, e.g. /api/stems): all callers
// of one bucket share a single daily counter, so it caps aggregate spend regardless of IP.
describe("enforceGlobalGenerationCeiling", () => {
  it("returns null while under the cap and shares ONE counter across callers", async () => {
    const bucket = uniqueBucket();
    // Two calls to the same bucket accumulate on one shared counter → the 3rd trips a cap of 2.
    expect(await enforceGlobalGenerationCeiling(bucket, 2)).toBeNull();
    expect(await enforceGlobalGenerationCeiling(bucket, 2)).toBeNull();
    expect(await enforceGlobalGenerationCeiling(bucket, 2)).toBeInstanceOf(Response);
  });

  // Security regression (Reviewer A, #318): the global counter must live in a keyspace the
  // per-user "gen" routes cannot reach. `userId` is client-supplied, unvalidated free text on
  // sfx/intro/voiceover/…, so if the global ceiling shared the "gen" kind a caller could POST
  // {userId:"stems"} (or the old "__global:stems" sentinel) to an unrelated route and drain the
  // global stems bucket. A dedicated "global-gen" kind makes that structurally impossible.
  it("does NOT share a keyspace with the per-user 'gen' ceiling (collision-proof)", async () => {
    // Hammer the per-user "gen" counter under the bucket name AND the old sentinel string.
    for (let i = 0; i < 20; i++) await enforceGenerationCeiling("stems");
    await enforceGenerationCeiling("__global:stems");
    // The global "stems" bucket is untouched → a cap of 1 still admits the first global call.
    expect(await enforceGlobalGenerationCeiling("stems", 1)).toBeNull();
    // …and the SECOND global call trips it, proving the global counter started fresh at 0.
    expect(await enforceGlobalGenerationCeiling("stems", 1)).toBeInstanceOf(Response);
  });

  it("returns a 429 Response once the shared cap is reached", async () => {
    const bucket = uniqueBucket();
    for (let i = 0; i < 3; i++) {
      expect(await enforceGlobalGenerationCeiling(bucket, 3)).toBeNull();
    }
    const blocked = await enforceGlobalGenerationCeiling(bucket, 3);
    expect(blocked).toBeInstanceOf(Response);
    expect(blocked?.status).toBe(429);
    const body = await blocked?.json();
    expect(body.error).toMatch(/daily generation limit/i);
  });

  it("isolates the cap per bucket", async () => {
    const a = uniqueBucket();
    const b = uniqueBucket();
    for (let i = 0; i < 2; i++) await enforceGlobalGenerationCeiling(a, 2);
    expect(await enforceGlobalGenerationCeiling(a, 2)).toBeInstanceOf(Response);
    expect(await enforceGlobalGenerationCeiling(b, 2)).toBeNull();
  });

  it("ships a positive default cap for the stems bucket", () => {
    expect(GLOBAL_STEMS_DAILY_CAP).toBeGreaterThan(0);
  });
});

// The ceiling is the wallet-drain backstop: an attacker rotating IPs with a valid userId is
// bounded by it. Its protective value depends on the per-day bucket RESETTING at the UTC day
// boundary (not permanently locking out a heavy-but-legitimate user) AND not resetting EARLY
// (which would re-open the drain within a day).
describe("UTC calendar-day reset", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps counting within the same UTC day, resets on the next day", async () => {
    vi.useFakeTimers();
    const userId = uniqueUser();

    // Mid-day: fill the export ceiling.
    vi.setSystemTime(new Date("2026-01-01T08:00:00.000Z"));
    for (let i = 0; i < DAILY_EXPORT_CAP; i++) await recordDailyExport(userId);
    expect((await checkDailySpendCeiling(userId)).allowed).toBe(false);

    // Later the SAME UTC day — still blocked (must not reset early).
    vi.setSystemTime(new Date("2026-01-01T23:59:59.000Z"));
    expect((await checkDailySpendCeiling(userId)).allowed).toBe(false);

    // Next UTC day — a fresh bucket key, count restarts at 0.
    vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
    const after = await checkDailySpendCeiling(userId);
    expect(after.allowed).toBe(true);
    expect(after.usage).toBe(0);
  });

  it("resets the GENERATION ceiling on the next UTC day", async () => {
    vi.useFakeTimers();
    const userId = uniqueUser();

    vi.setSystemTime(new Date("2026-02-01T12:00:00.000Z"));
    for (let i = 0; i < DAILY_GENERATION_CAP; i++) await recordDailyGeneration(userId);
    expect((await checkDailyGenerationCeiling(userId)).allowed).toBe(false);

    vi.setSystemTime(new Date("2026-02-02T00:00:00.000Z"));
    expect((await checkDailyGenerationCeiling(userId)).allowed).toBe(true);
  });
});

// Cross-instance durability rides on Vercel KV. When KV is configured but the round-trip
// FAILS (timeout/outage), the gate must FAIL CLOSED — an unverifiable ceiling must never
// authorize a paid call — consistent with the entitlement quota gate.
describe("fail-closed on KV error", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetCeilingStoreForTests();
  });

  function selectFailingKVStore(): void {
    // KV env present → getStore() picks the KV-backed store, which imports the (rejecting)
    // @vercel/kv mock declared at the top of this file.
    vi.stubEnv("KV_REST_API_URL", "https://kv.example");
    vi.stubEnv("KV_REST_API_TOKEN", "token");
    __resetCeilingStoreForTests();
  }

  it("blocks the export ceiling check when KV throws", async () => {
    selectFailingKVStore();
    const result = await checkDailySpendCeiling(uniqueUser());
    expect(result.allowed).toBe(false);
  });

  it("returns 429 from enforceGenerationCeiling when KV throws", async () => {
    selectFailingKVStore();
    const blocked = await enforceGenerationCeiling(uniqueUser());
    expect(blocked).toBeInstanceOf(Response);
    expect(blocked?.status).toBe(429);
  });

  it("returns 429 from enforceGlobalGenerationCeiling when KV throws (anonymous fail-closed)", async () => {
    selectFailingKVStore();
    const blocked = await enforceGlobalGenerationCeiling(uniqueBucket(), GLOBAL_STEMS_DAILY_CAP);
    expect(blocked).toBeInstanceOf(Response);
    expect(blocked?.status).toBe(429);
  });
});

// The KV store sets a 2-day TTL on the FIRST write of the day so a hammered counter still
// expires (a key without a TTL lives forever → the day's ceiling never resets), and wraps every
// KV op in withTimeout so a hung KV round-trip fails fast + closed rather than burning the whole
// serverless budget. These paths were previously unexercised.
describe("VercelKVDailyCeilingStore — TTL + timeout behavior", () => {
  function selectKVStore(): void {
    vi.stubEnv("KV_REST_API_URL", "https://kv.example");
    vi.stubEnv("KV_REST_API_TOKEN", "token");
    __resetCeilingStoreForTests();
  }
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetCeilingStoreForTests();
    vi.useRealTimers();
    // Restore the file-wide rejecting defaults so no later test is affected.
    mockKv.get.mockReset().mockRejectedValue(new Error("KV down"));
    mockKv.incr.mockReset().mockRejectedValue(new Error("KV down"));
    mockKv.expire.mockReset().mockRejectedValue(new Error("KV down"));
  });

  it("sets the 2-day TTL only on the FIRST write of the day (INCR → 1), never on later writes", async () => {
    selectKVStore();
    mockKv.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    mockKv.expire.mockResolvedValue(1);
    const user = uniqueUser();
    const expectedKey = `spend:gen:${dailyPeriodKey()}:${user}`;

    expect(await recordDailyGeneration(user)).toBe(1);
    expect(await recordDailyGeneration(user)).toBe(2);

    expect(mockKv.expire).toHaveBeenCalledTimes(1);
    expect(mockKv.expire).toHaveBeenCalledWith(expectedKey, 2 * 24 * 60 * 60);
  });

  it("still returns the incremented count when the best-effort EXPIRE fails (no spurious fail-closed)", async () => {
    selectKVStore();
    mockKv.incr.mockResolvedValueOnce(1);
    mockKv.expire.mockRejectedValueOnce(new Error("EXPIRE blip"));
    // INCR already durably bumped the count; a TTL hiccup must not throw / fail the caller closed.
    expect(await recordDailyGeneration(uniqueUser())).toBe(1);
  });

  it("a hung KV INCR rejects fast via withTimeout, failing the generation gate CLOSED (429)", async () => {
    vi.useFakeTimers();
    selectKVStore();
    mockKv.incr.mockReturnValue(new Promise<number>(() => {})); // never resolves
    const blockedP = enforceGenerationCeiling(uniqueUser());
    await vi.advanceTimersByTimeAsync(KV_OP_TIMEOUT_MS + 10);
    const blocked = await blockedP;
    expect(blocked).toBeInstanceOf(Response);
    expect(blocked?.status).toBe(429);
  });
});
