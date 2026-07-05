/**
 * /api/ios-plan route tests — iOS tape-planning proxy with server-side P0 gate.
 * Exercises input validation, the real entitlement gate (in-memory store), and
 * planFromScores error handling. Quota is consumed at /api/ios-score; ios-plan
 * only checks allowance (no consumeExport call here — verified in the 402 test).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/ios-plan/route";
import { consumeExport } from "@/lib/entitlement";
import { FREE_EXPORT_LIMIT, MAX_PLANNER_FRAMES } from "@/lib/constants";
import { planFromScores } from "@/actions/detect";

vi.mock("@/actions/detect", () => ({
  planFromScores: vi.fn(),
}));

function req(body: unknown): Request {
  return new Request("http://localhost/api/ios-plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const frame = { timeSec: 1.0, jpegBase64: "AAAA" };
const score = { timeSec: 1.0, score: 0.85, label: "epic moment" };
const mockResult = {
  clips: [{ order: 0, trimStart: 0, trimEnd: 5 }],
  detectedTheme: "sports",
  contentSummary: "sports highlight",
};

describe("POST /api/ios-plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(planFromScores).mockResolvedValue(mockResult as never);
  });

  it("400s on missing userId", async () => {
    const res = await POST(req({ frames: [frame], scores: [score] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/userId/);
  });

  it("400s on empty frames array", async () => {
    const res = await POST(req({ userId: "u", frames: [], scores: [score] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/frames/);
  });

  it("400s on empty scores array", async () => {
    const res = await POST(req({ userId: "u", frames: [frame], scores: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/scores/);
  });

  it("413s on an oversized frames array (H2 planner token-cost bound); planFromScores never called", async () => {
    const huge = Array.from({ length: MAX_PLANNER_FRAMES + 1 }, () => frame);
    const res = await POST(req({ userId: "u", frames: huge, scores: [score] }));
    expect(res.status).toBe(413);
    expect(vi.mocked(planFromScores)).not.toHaveBeenCalled();
  });

  it("413s on an oversized scores array (H2 planner token-cost bound); planFromScores never called", async () => {
    const huge = Array.from({ length: MAX_PLANNER_FRAMES + 1 }, () => score);
    const res = await POST(req({ userId: "u", frames: [frame], scores: huge }));
    expect(res.status).toBe(413);
    expect(vi.mocked(planFromScores)).not.toHaveBeenCalled();
  });

  it("402s when quota is exceeded; planFromScores never called", async () => {
    const userId = "ios-plan-over-quota-user";
    for (let i = 0; i < FREE_EXPORT_LIMIT; i++) await consumeExport({ userId });
    const res = await POST(req({ userId, frames: [frame], scores: [score] }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.remaining).toBe(0);
    expect(vi.mocked(planFromScores)).not.toHaveBeenCalled();
  });

  it("502s when planFromScores throws", async () => {
    vi.mocked(planFromScores).mockRejectedValue(new Error("upstream timeout"));
    const res = await POST(req({ userId: "ios-plan-throw-user", frames: [frame], scores: [score] }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Planning failed/);
  });

  it("200s and returns DetectionResult on success", async () => {
    const res = await POST(req({ userId: "ios-plan-success-user", frames: [frame], scores: [score] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.detectedTheme).toBe("sports");
    expect(Array.isArray(body.clips)).toBe(true);
  });
});
