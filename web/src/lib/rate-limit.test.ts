import { describe, it, expect, vi } from "vitest";
import {
  checkRateLimit,
  getClientIP,
  rateLimitResponse,
  assertRateLimitBypassNotOnLivePlatform,
} from "./rate-limit";

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

// The limiter is the first-line abuse brake on every paid endpoint. Its whole point is a
// SLIDING window: old hits must decay out so a legitimate user isn't locked out forever, and
// the window must NOT decay early (which would re-open a flood vector). Existing tests only
// covered allow/block within a single instant — the time-decay edge was untested.
describe("sliding-window decay", () => {
  it("allows requests again only after the window slides past the old hits", () => {
    vi.useFakeTimers();
    try {
      const key = `decay:${Math.random()}`;
      const config = { limit: 2, windowSec: 60 };
      const base = new Date("2026-03-01T00:00:00.000Z").getTime();
      vi.setSystemTime(base);

      expect(checkRateLimit(key, config).allowed).toBe(true);
      expect(checkRateLimit(key, config).allowed).toBe(true);
      // Third hit inside the window is blocked.
      expect(checkRateLimit(key, config).allowed).toBe(false);

      // 1ms before the window elapses — the two old hits are still in range, still blocked.
      vi.setSystemTime(base + 60_000 - 1);
      expect(checkRateLimit(key, config).allowed).toBe(false);

      // Once the full window elapses, the old hits decay out and the request is allowed.
      vi.setSystemTime(base + 60_000);
      const recovered = checkRateLimit(key, config);
      expect(recovered.allowed).toBe(true);
      expect(recovered.remaining).toBe(config.limit - 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("expires hits individually as the window slides (partial decay)", () => {
    vi.useFakeTimers();
    try {
      const key = `partial:${Math.random()}`;
      const config = { limit: 2, windowSec: 60 };
      const base = new Date("2026-04-01T00:00:00.000Z").getTime();

      vi.setSystemTime(base);
      checkRateLimit(key, config); // hit at t=0
      vi.setSystemTime(base + 30_000);
      checkRateLimit(key, config); // hit at t=30s — now at the limit
      expect(checkRateLimit(key, config).allowed).toBe(false);

      // At t=60s the first hit (t=0) decays out but the second (t=30s) remains → one slot frees.
      vi.setSystemTime(base + 60_000);
      expect(checkRateLimit(key, config).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("getClientIP", () => {
  it("prefers x-real-ip (Vercel-set, client-unspoofable) over x-forwarded-for", () => {
    // If both are present, the platform-trusted x-real-ip wins — a client cannot override it.
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "9.10.11.12", "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIP(req)).toBe("9.10.11.12");
  });

  it("uses x-real-ip when it is the only header", () => {
    const req = new Request("http://localhost", { headers: { "x-real-ip": "9.10.11.12" } });
    expect(getClientIP(req)).toBe("9.10.11.12");
  });

  it("falls back to the RIGHTMOST x-forwarded-for hop (trusted edge), not the leftmost", () => {
    // Chain "client, proxy, edge" — the rightmost is the hop the trusted terminating edge appended.
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.9.9.9" },
    });
    expect(getClientIP(req)).toBe("9.9.9.9");
  });

  it("is NOT spoofable by a client-supplied leftmost x-forwarded-for entry", () => {
    // An attacker sends a forged left-hand value to rotate the rate-limit key; when x-real-ip is
    // present it is ignored entirely, so the throttle key stays pinned to the real connecting IP.
    const spoofed = new Request("http://localhost", {
      headers: { "x-forwarded-for": "6.6.6.6", "x-real-ip": "203.0.113.7" },
    });
    expect(getClientIP(spoofed)).toBe("203.0.113.7");
    // And even with NO x-real-ip, two different forged leftmost values behind the same trusted edge
    // resolve to the SAME rightmost hop — so the attacker cannot mint fresh buckets by rotating XFF.
    const a = new Request("http://localhost", { headers: { "x-forwarded-for": "1.1.1.1, 8.8.8.8" } });
    const b = new Request("http://localhost", { headers: { "x-forwarded-for": "2.2.2.2, 8.8.8.8" } });
    expect(getClientIP(a)).toBe(getClientIP(b));
  });

  it("trims whitespace and ignores empty XFF segments", () => {
    const req = new Request("http://localhost", { headers: { "x-forwarded-for": " 1.2.3.4 ,  " } });
    expect(getClientIP(req)).toBe("1.2.3.4");
  });

  it("returns unknown when no IP header present", () => {
    expect(getClientIP(new Request("http://localhost"))).toBe("unknown");
  });
});

describe("assertRateLimitBypassNotOnLivePlatform", () => {
  it("THROWS when the bypass is set on a Vercel deployment (prod or preview)", () => {
    expect(() =>
      assertRateLimitBypassNotOnLivePlatform({ E2E_RATELIMIT_BYPASS: "1", VERCEL: "1" }),
    ).toThrow(/E2E_RATELIMIT_BYPASS .*Vercel/);
  });

  it("allows the bypass in CI / off-platform (VERCEL unset) — that's the legitimate use", () => {
    expect(() =>
      assertRateLimitBypassNotOnLivePlatform({ E2E_RATELIMIT_BYPASS: "1" }),
    ).not.toThrow();
  });

  it("does not throw on Vercel when the bypass is absent (normal production)", () => {
    expect(() =>
      assertRateLimitBypassNotOnLivePlatform({ VERCEL: "1" }),
    ).not.toThrow();
    expect(() => assertRateLimitBypassNotOnLivePlatform({})).not.toThrow();
  });

  it("only the exact '1' value arms the bypass (a stray value is inert, so no false boot-fail)", () => {
    expect(() =>
      assertRateLimitBypassNotOnLivePlatform({ E2E_RATELIMIT_BYPASS: "true", VERCEL: "1" }),
    ).not.toThrow();
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
