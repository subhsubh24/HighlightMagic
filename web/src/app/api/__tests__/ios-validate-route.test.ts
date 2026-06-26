/**
 * /api/ios-validate route tests — Haiku QA pass on assembled iOS tapes.
 * Exercises input validation and fail-open behaviour. No quota gate on this route.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/ios-validate/route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/ios-validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
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
});
