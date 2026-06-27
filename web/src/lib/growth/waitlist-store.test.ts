import { describe, it, expect, beforeEach } from "vitest";
import {
  addPendingSignup,
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
