import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock @vercel/kv so the KV-backed path can be exercised without a real connection (mirrors
// credit-store.test.ts). Harmless to the in-memory suites below — they never reach KV (no env).
const mockKv = {
  sadd: vi.fn<(key: string, member: string) => Promise<number>>(),
  set: vi.fn<(key: string, value: unknown, opts?: unknown) => Promise<string | null>>(),
  get: vi.fn<(key: string) => Promise<string | null>>(),
  del: vi.fn<(key: string) => Promise<number>>(),
  scard: vi.fn<(key: string) => Promise<number>>(),
};
vi.mock("@vercel/kv", () => ({ kv: mockKv }));

import {
  addPendingSignup,
  addConfirmedSignup,
  confirmSignup,
  getWaitlistCounts,
  isWaitlistStoreConfigured,
  _resetWaitlistMemory,
} from "./waitlist-store";
import { KV_OP_TIMEOUT_MS } from "../kv-quota-store";

// These run against the in-memory fallback (no KV env in CI/tests).
describe("waitlist store (E6a) — in-memory fallback", () => {
  beforeEach(() => {
    _resetWaitlistMemory();
  });

  it("is not 'configured' without KV env", () => {
    expect(isWaitlistStoreConfigured()).toBe(false);
  });

  it("records a pending signup and counts it as a raw signup immediately", async () => {
    const token = await addPendingSignup("a@b.com");
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);
    const counts = await getWaitlistCounts();
    expect(counts.signups).toBe(1);
    expect(counts.confirmed).toBe(0);
  });

  it("confirms a valid token and increments confirmed", async () => {
    const token = await addPendingSignup("a@b.com");
    const email = await confirmSignup(token);
    expect(email).toBe("a@b.com");
    const counts = await getWaitlistCounts();
    expect(counts.confirmed).toBe(1);
  });

  it("returns null for an unknown/expired token", async () => {
    expect(await confirmSignup("does-not-exist")).toBeNull();
    expect(await confirmSignup("")).toBeNull();
  });

  it("a confirmed token cannot be reused (single-use)", async () => {
    const token = await addPendingSignup("a@b.com");
    expect(await confirmSignup(token)).toBe("a@b.com");
    expect(await confirmSignup(token)).toBeNull();
  });

  it("issues distinct tokens per signup", async () => {
    const t1 = await addPendingSignup("a@b.com");
    const t2 = await addPendingSignup("c@d.com");
    expect(t1).not.toBe(t2);
    const counts = await getWaitlistCounts();
    expect(counts.signups).toBe(2);
  });
});

// addConfirmedSignup is the DECISION-COROLLARY path used when NO email provider is
// wired (the default pre-launch state): the signup is recorded as confirmed directly
// so the user is never dead-ended awaiting a confirmation email that can't be sent.
describe("waitlist store (E6a) — addConfirmedSignup (no-email-provider path)", () => {
  beforeEach(() => {
    _resetWaitlistMemory();
  });

  it("records a signup as both a raw signup AND confirmed immediately", async () => {
    await addConfirmedSignup("direct@b.com");
    const counts = await getWaitlistCounts();
    expect(counts.signups).toBe(1);
    expect(counts.confirmed).toBe(1);
  });

  it("is idempotent for a repeated email (Set-deduped, no double count)", async () => {
    await addConfirmedSignup("dup@b.com");
    await addConfirmedSignup("dup@b.com");
    const counts = await getWaitlistCounts();
    expect(counts.signups).toBe(1);
    expect(counts.confirmed).toBe(1);
  });

  it("confirms an email that first arrived as pending, without needing its token", async () => {
    await addPendingSignup("both@b.com");
    let counts = await getWaitlistCounts();
    expect(counts.signups).toBe(1);
    expect(counts.confirmed).toBe(0);

    await addConfirmedSignup("both@b.com");
    counts = await getWaitlistCounts();
    // Same email in both the emails and confirmed sets — still one distinct signup.
    expect(counts.signups).toBe(1);
    expect(counts.confirmed).toBe(1);
  });

  it("does not consume unrelated pending tokens (orthogonal to double-opt-in)", async () => {
    const token = await addPendingSignup("pending@b.com");
    await addConfirmedSignup("direct@b.com");
    // The direct confirm must not confirm or invalidate the separate pending signup.
    let counts = await getWaitlistCounts();
    expect(counts.signups).toBe(2);
    expect(counts.confirmed).toBe(1);
    // The pending token is still valid and confirmable.
    expect(await confirmSignup(token)).toBe("pending@b.com");
    counts = await getWaitlistCounts();
    expect(counts.confirmed).toBe(2);
  });
});

// ── VercelKV path (production — durable, cross-instance) ────────────────────────────────
// The KV ops must be wrapped in a timeout so a hung KV call fails FAST (catchable) instead of
// sitting idle until Vercel hard-kills the serverless function (the serverless-budget rule).
describe("waitlist store (E6a) — Vercel KV path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("KV_REST_API_URL", "https://example.kv.vercel.app");
    vi.stubEnv("KV_REST_API_TOKEN", "tok_secret");
    _resetWaitlistMemory();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetWaitlistMemory();
  });

  it("uses the KV store when configured", () => {
    expect(isWaitlistStoreConfigured()).toBe(true);
  });

  it("addPendingSignup writes the raw-signup member then the pending token with a TTL", async () => {
    mockKv.sadd.mockResolvedValue(1);
    mockKv.set.mockResolvedValue("OK");

    const token = await addPendingSignup("kv@b.com");

    expect(mockKv.sadd).toHaveBeenCalledWith("waitlist:emails", "kv@b.com");
    expect(mockKv.set).toHaveBeenCalledWith(
      `waitlist:pending:${token}`,
      "kv@b.com",
      expect.objectContaining({ ex: 60 * 60 * 24 * 7 }),
    );
  });

  it("confirmSignup promotes a pending token to confirmed and deletes the token", async () => {
    mockKv.get.mockResolvedValue("kv@b.com");
    mockKv.sadd.mockResolvedValue(1);
    mockKv.del.mockResolvedValue(1);

    const email = await confirmSignup("tok-123");

    expect(email).toBe("kv@b.com");
    expect(mockKv.sadd).toHaveBeenCalledWith("waitlist:confirmed", "kv@b.com");
    expect(mockKv.del).toHaveBeenCalledWith("waitlist:pending:tok-123");
  });

  it("confirmSignup returns null for an unknown/expired token without mutating state", async () => {
    mockKv.get.mockResolvedValue(null);

    expect(await confirmSignup("gone")).toBeNull();
    expect(mockKv.sadd).not.toHaveBeenCalled();
    expect(mockKv.del).not.toHaveBeenCalled();
  });

  it("a hung KV op rejects via the timeout so the route fails closed (never burns the budget)", async () => {
    vi.useFakeTimers();
    mockKv.sadd.mockReturnValue(new Promise<number>(() => {})); // never resolves

    const pending = addPendingSignup("hang@b.com");
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(KV_OP_TIMEOUT_MS + 10);
    await assertion;

    vi.useRealTimers();
  });

  it("a hung confirmSignup read rejects via the timeout", async () => {
    vi.useFakeTimers();
    mockKv.get.mockReturnValue(new Promise<string | null>(() => {})); // never resolves

    const pending = confirmSignup("tok-x");
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(KV_OP_TIMEOUT_MS + 10);
    await assertion;

    vi.useRealTimers();
  });

  // addConfirmedSignup is the DECISION-COROLLARY path (no email provider): the signup is written
  // straight to CONFIRMED so the user is never dead-ended awaiting an un-sendable email. In KV
  // mode it must durably add to BOTH the raw-signup set (funnel top) and the confirmed set.
  it("addConfirmedSignup writes the email to both the emails and confirmed KV sets", async () => {
    mockKv.sadd.mockResolvedValue(1);

    await addConfirmedSignup("direct-kv@b.com");

    expect(mockKv.sadd).toHaveBeenCalledWith("waitlist:emails", "direct-kv@b.com");
    expect(mockKv.sadd).toHaveBeenCalledWith("waitlist:confirmed", "direct-kv@b.com");
  });

  it("getWaitlistCounts reads the real KV set cardinalities", async () => {
    mockKv.scard.mockResolvedValueOnce(42).mockResolvedValueOnce(7);

    const counts = await getWaitlistCounts();

    expect(mockKv.scard).toHaveBeenCalledWith("waitlist:emails");
    expect(mockKv.scard).toHaveBeenCalledWith("waitlist:confirmed");
    expect(counts).toEqual({ signups: 42, confirmed: 7 });
  });

  // Regression: kv.scard can return null (missing key). The counts MUST coalesce to 0, never
  // surface undefined into the funnel/analytics feed (the `?? 0` branch).
  it("getWaitlistCounts coalesces a null KV cardinality to 0 (never undefined)", async () => {
    mockKv.scard.mockResolvedValue(null as unknown as number);

    const counts = await getWaitlistCounts();

    expect(counts).toEqual({ signups: 0, confirmed: 0 });
  });
});
