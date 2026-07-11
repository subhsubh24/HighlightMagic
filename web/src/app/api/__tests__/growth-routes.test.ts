import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as waitlistPOST } from "@/app/api/waitlist/route";
import { GET as confirmGET } from "@/app/api/waitlist/confirm/route";
import { GET as statsGET } from "@/app/api/growth/stats/route";
import { _resetBuckets } from "@/lib/rate-limit";
import { _resetWaitlistMemory } from "@/lib/growth/waitlist-store";

function waitlistReq(body: unknown, ip = "198.51.100.1") {
  return new NextRequest("http://localhost/api/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("E6a — waitlist double-opt-in flow", () => {
  beforeEach(() => {
    _resetBuckets();
    _resetWaitlistMemory();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("accepts a valid email and returns ok (dry-run safe, no email creds)", async () => {
    const res = await waitlistPOST(waitlistReq({ email: "person@example.com" }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("rejects an invalid email with 400", async () => {
    const res = await waitlistPOST(waitlistReq({ email: "not-an-email" }, "198.51.100.2"));
    expect(res.status).toBe(400);
  });

  it("rejects an over-long email with 400 (input bound)", async () => {
    const long = "a".repeat(250) + "@b.com";
    const res = await waitlistPOST(waitlistReq({ email: long }, "198.51.100.3"));
    expect(res.status).toBe(400);
  });

  it("rate-limits repeated signups from one IP", async () => {
    const ip = "198.51.100.9";
    let last = 200;
    for (let i = 0; i < 12; i++) {
      const r = await waitlistPOST(waitlistReq({ email: `u${i}@example.com` }, ip));
      last = r.status;
    }
    expect(last).toBe(429);
  });

  it("confirm link with a bad token shows a generic expired page (no enumeration)", async () => {
    const req = new NextRequest("http://localhost/api/waitlist/confirm?token=bogus");
    const res = await confirmGET(req);
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toMatch(/expired/i);
    expect(html).not.toMatch(/bogus/); // never echoes the token
  });
});

describe("E6d — /api/growth/stats read-API", () => {
  beforeEach(() => {
    _resetBuckets();
    _resetWaitlistMemory();
    vi.unstubAllEnvs();
  });
  afterEach(() => vi.unstubAllEnvs());

  function statsReq(auth?: string, ip = "203.0.113.50") {
    const headers: Record<string, string> = { "x-forwarded-for": ip };
    if (auth !== undefined) headers["authorization"] = auth;
    return new NextRequest("http://localhost/api/growth/stats", { headers });
  }

  it("returns 503 when GROWTH_AGENT_SECRET is not configured", async () => {
    vi.stubEnv("GROWTH_AGENT_SECRET", "");
    const res = await statsGET(statsReq("Bearer anything"));
    expect(res.status).toBe(503);
  });

  it("returns 401 when the bearer token is wrong", async () => {
    vi.stubEnv("GROWTH_AGENT_SECRET", "s".repeat(32));
    const res = await statsGET(statsReq("Bearer wrong", "203.0.113.51"));
    expect(res.status).toBe(401);
  });

  it("returns 401 for a same-length wrong token (constant-time compare, no length short-circuit)", async () => {
    vi.stubEnv("GROWTH_AGENT_SECRET", "s".repeat(32));
    // Same length as the secret but different content — exercises the content-mismatch branch
    // of the SHA-256 + timingSafeEqual comparison, not just the length-mismatch path above.
    const res = await statsGET(statsReq(`Bearer ${"x".repeat(32)}`, "203.0.113.53"));
    expect(res.status).toBe(401);
  });

  it("returns aggregate metrics with a correct secret (no PII)", async () => {
    const secret = "s".repeat(32);
    vi.stubEnv("GROWTH_AGENT_SECRET", secret);
    const res = await statsGET(statsReq(`Bearer ${secret}`, "203.0.113.52"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.funnel).toBeDefined();
    expect(typeof body.funnel.waitlist_signups).toBe("number");
    expect(body.awaiting_connect).toBe(true);
    // no raw email fields leak
    expect(JSON.stringify(body)).not.toMatch(/@/);
  });
});
