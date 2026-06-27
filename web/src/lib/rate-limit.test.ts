import { describe, it, expect } from "vitest";
import { checkRateLimit, getClientIP, rateLimitResponse } from "./rate-limit";

describe("checkRateLimit", () => {
  it("allows requests within limit", () => {
    const key = `test-allow:${Math.random()}`;
    const config = { limit: 3, windowSec: 60 };
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, config).allowed).toBe(true);
    }
  });

  it("blocks the request when limit is exceeded", () => {
    const key = `test-block:${Math.random()}`;
    const config = { limit: 2, windowSec: 60 };
    checkRateLimit(key, config);
    checkRateLimit(key, config);
    const result = checkRateLimit(key, config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("decrements remaining correctly", () => {
    const key = `test-remaining:${Math.random()}`;
    const config = { limit: 5, windowSec: 60 };
    expect(checkRateLimit(key, config).remaining).toBe(4);
    expect(checkRateLimit(key, config).remaining).toBe(3);
  });

  it("uses independent buckets for different keys", () => {
    const cfg = { limit: 1, windowSec: 60 };
    expect(checkRateLimit(`ka:${Math.random()}`, cfg).allowed).toBe(true);
    expect(checkRateLimit(`kb:${Math.random()}`, cfg).allowed).toBe(true);
  });

  it("sets resetAt in the future", () => {
    const now = Math.floor(Date.now() / 1000);
    const result = checkRateLimit(`ts:${Math.random()}`, { limit: 5, windowSec: 30 });
    expect(result.resetAt).toBeGreaterThan(now);
    expect(result.resetAt).toBeLessThanOrEqual(now + 31);
  });

  it("includes limit in the result", () => {
    const key = `test-limit:${Math.random()}`;
    const result = checkRateLimit(key, { limit: 7, windowSec: 60 });
    expect(result.limit).toBe(7);
  });
});

describe("getClientIP", () => {
  it("extracts first IP from x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIP(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://localhost", { headers: { "x-real-ip": "9.10.11.12" } });
    expect(getClientIP(req)).toBe("9.10.11.12");
  });

  it("returns unknown when no IP header present", () => {
    expect(getClientIP(new Request("http://localhost"))).toBe("unknown");
  });
});

describe("rateLimitResponse", () => {
  it("returns 429 with Retry-After header", () => {
    const result = { allowed: false, limit: 10, remaining: 0, resetAt: Math.floor(Date.now() / 1000) + 30 };
    const res = rateLimitResponse(result);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});
