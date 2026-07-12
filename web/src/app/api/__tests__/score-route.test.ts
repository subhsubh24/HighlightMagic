/**
 * /api/score route tests — the iOS frame-scoring proxy with the server-side P0 gate.
 * Exercises the real entitlement gate (in-memory store) + mocks the Anthropic call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/score/route";
import { consumeExport } from "@/lib/entitlement";
import { FREE_EXPORT_LIMIT } from "@/lib/constants";
import { DAILY_EXPORT_CAP, recordDailyExport, __resetCeilingStoreForTests } from "@/lib/spend-ceiling";

function req(body: unknown): Request {
  return new Request("http://localhost/api/score", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const frame = { timeSec: 1, jpegBase64: "AAAA" };

describe("/api/score", () => {
  const realKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    vi.restoreAllMocks();
  });
  afterEach(() => {
    if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = realKey;
  });

  it("400s on missing userId", async () => {
    const res = await POST(req({ frames: [frame] }));
    expect(res.status).toBe(400);
  });

  it("400s on empty/invalid frames", async () => {
    expect((await POST(req({ userId: "u", frames: [] }))).status).toBe(400);
    expect((await POST(req({ userId: "u", frames: [{ timeSec: 1 }] }))).status).toBe(400);
  });

  it("400s (before any paid call) on an oversized frame COUNT — H2 CPU-DoS backstop", async () => {
    // A tampered client could send 10k+ well-shaped frames; without a count bound the route would
    // run the O(n) shape + per-frame size scans over all of them before silently slicing to
    // MAX_FRAMES=120. The count guard rejects early — mirrors /api/ios-score's `> 1000` bound.
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const tooMany = Array.from({ length: 1001 }, (_, i) => ({ timeSec: i, jpegBase64: "AAAA" }));
    const res = await POST(req({ userId: "u", frames: tooMany }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/1000 or fewer/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("402s once the free monthly limit is reached (gate runs before any paid call)", async () => {
    const userId = "over-quota-user";
    for (let i = 0; i < FREE_EXPORT_LIMIT; i++) await consumeExport({ userId }); // default singleton store
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await POST(req({ userId, frames: [frame] }));
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.remaining).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled(); // never hit the paid API when over quota
  });

  it("429s once the daily export ceiling is hit — before the Anthropic call (H7 wallet-drain backstop)", async () => {
    // An in-quota user (fresh monthly limit) who has already hit the per-user DAILY_EXPORT_CAP must
    // be blocked at the ceiling BEFORE the paid Anthropic scoring call — the monthly quota (402) and
    // the daily ceiling (429) are independent wallet backstops. recordDailyExport does not touch the
    // monthly counter, so checkExportAllowed still passes and the ceiling is the thing that blocks.
    __resetCeilingStoreForTests();
    const userId = "score-daily-ceiling-user";
    for (let i = 0; i < DAILY_EXPORT_CAP; i++) await recordDailyExport(userId);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await POST(req({ userId, frames: [frame] }));
    expect(res.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled(); // never hit the paid API once the ceiling trips
  });

  it("503s when the server key is not configured (for an in-quota user)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(req({ userId: "fresh-503-user", frames: [frame] }));
    expect(res.status).toBe(503);
  });

  it("returns a generic 502 without leaking the upstream status (H3 error hygiene)", async () => {
    // A non-OK upstream (e.g. 503/429) must not have its HTTP status echoed to the client —
    // that enables provider/rate-limit enumeration. The route returns a generic message.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("rate limited", { status: 503 }));
    const res = await POST(req({ userId: "h3-upstream-status-user", frames: [frame] }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("scoring failed");
    expect(JSON.stringify(body)).not.toContain("503");
  });

  it("returns 502 (not an uncaught 500) when the upstream 200 body is unparseable", async () => {
    // A 200 whose body isn't JSON must not throw out of the handler — it returns the same
    // graceful 502 as the fetch/!ok paths.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<<not json>>", { status: 200 }));
    const res = await POST(req({ userId: "corrupt-body-user", frames: [frame] }));
    expect(res.status).toBe(502);
  });

  it("scores a fresh user and decrements remaining", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ text: '[{"time":1,"score":0.91}]' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200 },
      ),
    );
    const res = await POST(req({ userId: "fresh-ok-user", frames: [frame], prompt: "dunks" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.scores).toEqual([{ timeSec: 1, score: 0.91 }]);
    expect(json.remaining).toBe(FREE_EXPORT_LIMIT - 1);
  });
});
