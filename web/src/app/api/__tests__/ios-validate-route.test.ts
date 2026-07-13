/**
 * /api/ios-validate route tests — Haiku QA pass on assembled iOS tapes.
 * Exercises input validation, fail-open behaviour, and H1 rate limiting.
 * No quota gate on this route (validation is a sub-step of an already-gated export).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/ios-validate/route";
import { _resetBuckets, PAID_RATE_LIMIT } from "@/lib/rate-limit";
import { consumeExport } from "@/lib/entitlement";
import { FREE_EXPORT_LIMIT } from "@/lib/constants";

function req(body: unknown, ip = "1.2.3.4"): Request {
  return new Request("http://localhost/api/ios-validate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const clip = {
  captionText: "Amazing play",
  durationSec: 3.5,
  filter: "none",
  transition: "default",
  order: 0,
};

const haikuOk = {
  content: [
    { type: "text", text: JSON.stringify({ passed: true, issues: [], fixes: {} }) },
  ],
};

describe("POST /api/ios-validate", () => {
  beforeEach(() => {
    _resetBuckets();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
  });

  it("400s on missing userId", async () => {
    const res = await POST(req({ clips: [clip] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/userId/);
  });

  it("400s on empty clips array", async () => {
    const res = await POST(req({ userId: "u", clips: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/clips/);
  });

  it("400s when clips exceeds MAX_FILES (H2 bound)", async () => {
    const clips = Array.from({ length: 101 }, () => clip);
    const res = await POST(req({ userId: "u", clips }, "203.0.113.9"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too many clips/);
  });

  it("400s when clipFrames exceeds MAX_FILES (H2 bound)", async () => {
    const clipFrames = Array.from({ length: 101 }, (_, i) => ({ clipIndex: i, jpegBase64: "x" }));
    const res = await POST(req({ userId: "u", clips: [clip], clipFrames }, "203.0.113.10"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too many clip frames/);
  });

  it("passes by default when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(req({ userId: "u", clips: [clip] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("fail-open when fetch throws (network error)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network error"));
    const res = await POST(req({ userId: "u", clips: [clip] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
  });

  it("fail-open when Haiku returns non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "overloaded" }), { status: 529 })
    );
    const res = await POST(req({ userId: "u", clips: [clip] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
  });

  it("does NOT re-gate the monthly export quota — a free user at their limit still validates (no 402)", async () => {
    // Regression guard for the sub-step contract (route docstring + this file's header): the monthly
    // quota is consumed once at /api/ios-score. This route must NOT re-check it — doing so 402'd the
    // LAST allowed free export of the month (score consumes export N, bringing usage to the limit, then
    // the QA sub-step of that same already-paid export saw used==limit and rejected it). Exhaust the
    // quota, then assert the validation pass still succeeds. If a checkExportAllowed()/402 gate is ever
    // re-introduced, this flips to a 402 and fails loud.
    const userId = "ios-validate-overquota";
    for (let i = 0; i < FREE_EXPORT_LIMIT; i++) await consumeExport({ userId });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(haikuOk), { status: 200 })
    );
    const res = await POST(req({ userId, clips: [clip], contentSummary: "sports" }, "198.51.100.7"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
  });

  it("200s and returns passed/issues/fixes on Haiku success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(haikuOk), { status: 200 })
    );
    const res = await POST(req({ userId: "u", clips: [clip], contentSummary: "sports" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
    expect(Array.isArray(body.issues)).toBe(true);
    expect(typeof body.fixes).toBe("object");
  });

  it("429s after exceeding the per-IP paid rate limit (H1)", async () => {
    // Missing API key → fail-open 200 without any paid call, isolating the rate-limit behaviour.
    delete process.env.ANTHROPIC_API_KEY;
    const ip = "9.9.9.9";
    for (let i = 0; i < PAID_RATE_LIMIT.limit; i++) {
      const ok = await POST(req({ userId: "u", clips: [clip] }, ip));
      expect(ok.status).toBe(200);
    }
    const limited = await POST(req({ userId: "u", clips: [clip] }, ip));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });

  it("rate-limit is keyed per-IP (a different IP is not throttled)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    for (let i = 0; i < PAID_RATE_LIMIT.limit; i++) {
      await POST(req({ userId: "u", clips: [clip] }, "5.5.5.5"));
    }
    const other = await POST(req({ userId: "u", clips: [clip] }, "6.6.6.6"));
    expect(other.status).toBe(200);
  });
});
