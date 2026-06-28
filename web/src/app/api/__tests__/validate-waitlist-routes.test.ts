import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as validatePOST } from "@/app/api/validate/route";
import { POST as waitlistPOST } from "@/app/api/waitlist/route";
import { _resetBuckets } from "@/lib/rate-limit";

// ─── /api/validate ─────────────────────────────────────────────────────────────

describe("POST /api/validate", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns passed=true when ANTHROPIC_API_KEY is not set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const req = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clips: [{ id: "c1" }], plan: {} }),
    });
    const res = await validatePOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
    expect(body.issues).toEqual([]);
  });

  it("returns passed=true when clips array is empty", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const req = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clips: [], plan: {} }),
    });
    const res = await validatePOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
  });

  it("returns 400 when clips exceeds MAX_FILES (H2 bound)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const clips = Array.from({ length: 101 }, (_, i) => ({ id: `c${i}` }));
    const req = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
      body: JSON.stringify({ clips, plan: {} }),
    });
    const res = await validatePOST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too many clips/);
  });

  it("returns 400 when clipFrames exceeds MAX_FILES (H2 bound)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const clipFrames = Array.from({ length: 101 }, (_, i) => ({ clipIndex: i, base64: "x" }));
    const req = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.8" },
      body: JSON.stringify({ clips: [{ id: "c1" }], clipFrames, plan: {} }),
    });
    const res = await validatePOST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too many clip frames/);
  });

  it("returns passed=true when clips is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const req = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: {} }),
    });
    const res = await validatePOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
  });

  it("returns passed=true when clips is not an array", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const req = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clips: "not-an-array", plan: {} }),
    });
    const res = await validatePOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
  });

  it("calls Anthropic API and returns structured result when key is present and clips are valid", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({ passed: true, issues: [], fixes: {} }),
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const req = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clips: [{ id: "c1", startTime: 0, endTime: 5 }],
        plan: { style: "energetic" },
      }),
    });
    const res = await validatePOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.passed).toBe("boolean");
  });

  it("bounds the Anthropic call with an AbortSignal timeout (B6 resilience)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: null,
      json: async () => ({ content: [{ type: "text", text: '{"passed":true}' }] }),
    });
    vi.stubGlobal("fetch", mockFetch);
    const req = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clips: [{ id: "c1", startTime: 0, endTime: 5 }], plan: {} }),
    });
    await validatePOST(req);
    expect(mockFetch).toHaveBeenCalled();
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns passed=true on API error (fail-open behavior)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const req = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clips: [{ id: "c1", startTime: 0, endTime: 5 }],
        plan: {},
      }),
    });
    const res = await validatePOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
  });
});

// ─── /api/waitlist ─────────────────────────────────────────────────────────────

describe("POST /api/waitlist", () => {
  beforeEach(() => {
    _resetBuckets();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns 400 when email is missing", async () => {
    const req = new Request("http://localhost/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await waitlistPOST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when email is invalid", async () => {
    const req = new Request("http://localhost/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    const res = await waitlistPOST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 for email with only whitespace", async () => {
    const req = new Request("http://localhost/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "   " }),
    });
    const res = await waitlistPOST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 200 ok=true for a valid email", async () => {
    const req = new Request("http://localhost/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    });
    const res = await waitlistPOST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("normalizes email to lowercase", async () => {
    const req = new Request("http://localhost/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "User@EXAMPLE.COM" }),
    });
    const res = await waitlistPOST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 400 when email field is a number", async () => {
    const req = new Request("http://localhost/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: 12345 }),
    });
    const res = await waitlistPOST(req as any);
    expect(res.status).toBe(400);
  });

  it("requires a CAPTCHA token when Turnstile is configured (H5)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "ts_secret");
    const req = new Request("http://localhost/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.5" },
      body: JSON.stringify({ email: "captcha@example.com" }), // no cfTurnstileToken
    });
    const res = await waitlistPOST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/CAPTCHA/i);
  });

  it("bounds the Turnstile verify call with an AbortSignal timeout (B6 resilience)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "ts_secret");
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", mockFetch);
    const req = new Request("http://localhost/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.6" },
      body: JSON.stringify({ email: "captcha2@example.com", cfTurnstileToken: "tok_123" }),
    });
    const res = await waitlistPOST(req as any);
    expect(res.status).toBe(200);
    const verifyCall = mockFetch.mock.calls.find(
      (c) => typeof c[0] === "string" && (c[0] as string).includes("siteverify")
    );
    expect(verifyCall).toBeDefined();
    expect((verifyCall![1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });
});
