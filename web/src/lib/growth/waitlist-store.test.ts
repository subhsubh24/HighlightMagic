import { describe, it, expect, beforeEach } from "vitest";
import {
  addPendingSignup,
  addConfirmedSignup,
  confirmSignup,
  getWaitlistCounts,
  isWaitlistStoreConfigured,
  _resetWaitlistMemory,
} from "./waitlist-store";

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
