/**
 * /api/plan route tests — the WEB tape-planning proxy (the priciest paid call: the Sonnet
 * planner runs 1-3 min of adaptive thinking). Unlike /api/ios-plan this route STREAMS its
 * result as SSE, but the load-bearing guards run BEFORE the stream: rate limit (H1), input
 * bounds (H2), and the server-side quota gate (P0) that must fire before any paid call.
 * ios-plan had dedicated tests for these; the web plan route only appeared in the rate-limit
 * sweep — so a regression that dropped the quota gate (a wallet-drain) could ship silently.
 *
 * Quota is consumed at /api/score; this route only checks allowance (no consumeExport here).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/plan/route";
import { consumeExport } from "@/lib/entitlement";
import { FREE_EXPORT_LIMIT } from "@/lib/constants";
import { planFromScores } from "@/actions/detect";
import { enforceGenerationCeiling } from "@/lib/spend-ceiling";
import { _resetBuckets, PAID_RATE_LIMIT } from "@/lib/rate-limit";

vi.mock("@/actions/detect", () => ({ planFromScores: vi.fn() }));
vi.mock("@/lib/spend-ceiling", () => ({ enforceGenerationCeiling: vi.fn() }));

function req(body: unknown, ip = "1.2.3.4"): Request {
  return new Request("http://localhost/api/plan", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

/** Drain an SSE Response body to a string (real timers; reads to completion before any keepalive). */
async function readSSE(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

const frame = { timeSec: 1.0, jpegBase64: "AAAA" };
const score = { timeSec: 1.0, score: 0.85, label: "epic moment" };
const mockResult = {
  clips: [{ order: 0, trimStart: 0, trimEnd: 5 }],
  detectedTheme: "sports",
  contentSummary: "sports highlight",
};

describe("POST /api/plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetBuckets();
    vi.mocked(planFromScores).mockResolvedValue(mockResult as never);
    vi.mocked(enforceGenerationCeiling).mockResolvedValue(null as never); // not blocked by default
  });

  it("400s on missing userId (before any paid call)", async () => {
    const res = await POST(req({ frames: [frame], scores: [score] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/userId/);
    expect(vi.mocked(planFromScores)).not.toHaveBeenCalled();
  });

  it("400s when frames/scores are not arrays", async () => {
    const res = await POST(req({ userId: "u", frames: "nope", scores: [score] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/arrays/);
  });

  it("413s on an oversized creativeDirection (H2 token-cost bound)", async () => {
    const res = await POST(
      req({ userId: "u", frames: [frame], scores: [score], creativeDirection: "x".repeat(100_000) }),
    );
    expect(res.status).toBe(413);
    expect(vi.mocked(planFromScores)).not.toHaveBeenCalled();
  });

  it("402s when over quota — the gate fires BEFORE the paid call (planFromScores never runs)", async () => {
    const userId = "web-plan-over-quota-user";
    for (let i = 0; i < FREE_EXPORT_LIMIT; i++) await consumeExport({ userId });
    const res = await POST(req({ userId, frames: [frame], scores: [score] }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.remaining).toBe(0);
    // The whole point: neither the paid planner nor the ceiling stream was reached.
    expect(vi.mocked(planFromScores)).not.toHaveBeenCalled();
    expect(vi.mocked(enforceGenerationCeiling)).not.toHaveBeenCalled();
  });

  it("streams the plan result on success (200 SSE, planner called once)", async () => {
    const res = await POST(req({ userId: "web-plan-success-user", frames: [frame], scores: [score] }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const sse = await readSSE(res);
    expect(sse).toContain("event: result");
    expect(sse).toContain("sports"); // detectedTheme forwarded to the client
    expect(vi.mocked(planFromScores)).toHaveBeenCalledTimes(1);
  });

  it("streams a generic error (never the raw upstream detail) when the planner throws (H3)", async () => {
    vi.mocked(planFromScores).mockRejectedValue(new Error("anthropic 500: secret internal detail"));
    const res = await POST(req({ userId: "web-plan-throw-user", frames: [frame], scores: [score] }));
    expect(res.status).toBe(200); // the stream opened, then emits an error event
    const sse = await readSSE(res);
    expect(sse).toContain("event: error");
    expect(sse).toContain("Planning failed");
    expect(sse).not.toContain("secret internal detail"); // no leak of upstream error text
  });

  it("blocks with the daily generation ceiling before calling the paid planner (H7)", async () => {
    vi.mocked(enforceGenerationCeiling).mockResolvedValue({ blocked: true } as never);
    const res = await POST(req({ userId: "web-plan-ceiling-user", frames: [frame], scores: [score] }));
    expect(res.status).toBe(200);
    const sse = await readSSE(res);
    expect(sse).toContain("event: error");
    expect(sse).toContain("Daily generation limit reached");
    expect(vi.mocked(planFromScores)).not.toHaveBeenCalled();
  });

  it("429s once the per-IP rate limit is exceeded (H1 — before body parse)", async () => {
    // Rate limit is checked first, so requests that would 400 still consume a token.
    for (let i = 0; i < PAID_RATE_LIMIT.limit; i++) {
      const r = await POST(req({ frames: [], scores: [] }, "5.5.5.5")); // missing userId -> 400, but counted
      expect(r.status).toBe(400);
    }
    const blocked = await POST(req({ frames: [], scores: [] }, "5.5.5.5"));
    expect(blocked.status).toBe(429);
  });
});
