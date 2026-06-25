/**
 * /api/score route tests — the iOS frame-scoring proxy with the server-side P0 gate.
 * Exercises the real entitlement gate (in-memory store) + mocks the Anthropic call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/score/route";
import { consumeExport } from "@/lib/entitlement";
import { FREE_EXPORT_LIMIT } from "@/lib/constants";

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

  it("503s when the server key is not configured (for an in-quota user)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(req({ userId: "fresh-503-user", frames: [frame] }));
    expect(res.status).toBe(503);
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
