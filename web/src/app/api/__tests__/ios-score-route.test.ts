/**
 * /api/ios-score route tests — the iOS frame-scoring proxy with the server-side P0 gate.
 * Exercises the real entitlement gate (in-memory store) + mocks the Anthropic call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/ios-score/route";
import { consumeExport } from "@/lib/entitlement";
import { FREE_EXPORT_LIMIT } from "@/lib/constants";
import { DAILY_EXPORT_CAP, recordDailyExport, __resetCeilingStoreForTests } from "@/lib/spend-ceiling";
import { grantCredits, getCreditBalance } from "@/lib/credit-store";
import { MAX_TEMPLATE_NAME_CHARS } from "@/lib/input-bounds";

function req(body: unknown): Request {
  return new Request("http://localhost/api/ios-score", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const frame = { timeSec: 1.0, jpegBase64: "AAAA" };

describe("POST /api/ios-score", () => {
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
    const body = await res.json();
    expect(body.error).toMatch(/userId/);
  });

  it("400s on empty frames array", async () => {
    const res = await POST(req({ userId: "u", frames: [] }));
    expect(res.status).toBe(400);
  });

  it("400s when a frame is missing jpegBase64", async () => {
    const res = await POST(req({ userId: "u", frames: [{ timeSec: 1.0 }] }));
    expect(res.status).toBe(400);
  });

  it("413s on an oversized templateName — before any paid Anthropic call (H2 cost/injection bound)", async () => {
    // templateName is interpolated verbatim into the paid scoring system prompt; an unbounded value
    // would inflate the per-call token bill. It must be rejected before the provider fetch.
    // Distinct IP so this extra request doesn't consume the shared per-IP PAID_RATE_LIMIT bucket
    // that the other same-IP tests in this file collectively fill.
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const bigTemplateReq = new Request("http://localhost/api/ios-score", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7" },
      body: JSON.stringify({
        userId: "ios-score-big-template-user",
        frames: [frame],
        templateName: "x".repeat(MAX_TEMPLATE_NAME_CHARS + 1),
      }),
    });
    const res = await POST(bigTemplateReq);
    expect(res.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("402s once the free monthly limit is reached (gate runs before any paid call)", async () => {
    const userId = "ios-score-over-quota-user";
    for (let i = 0; i < FREE_EXPORT_LIMIT; i++) await consumeExport({ userId });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await POST(req({ userId, frames: [frame] }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.remaining).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("429s once the daily export ceiling is hit — before the Anthropic call (H7 wallet-drain backstop)", async () => {
    // Independent of the monthly quota: an in-quota user who has hit DAILY_EXPORT_CAP is blocked at
    // the ceiling before the paid scoring call. recordDailyExport does not consume monthly quota, so
    // checkExportAllowed passes and the daily ceiling is what returns 429.
    __resetCeilingStoreForTests();
    const userId = "ios-score-daily-ceiling-user";
    for (let i = 0; i < DAILY_EXPORT_CAP; i++) await recordDailyExport(userId);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await POST(req({ userId, frames: [frame] }));
    expect(res.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("502s when ANTHROPIC_API_KEY is not set (for an in-quota user)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(req({ userId: "ios-score-no-key-user", frames: [frame] }));
    expect(res.status).toBe(502);
  });

  it("scores frames and decrements remaining on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: '[{"index":0,"score":0.88,"role":"HERO","label":"player mid-air dunk — viral peak moment at apex"}]',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const res = await POST(req({ userId: "ios-score-fresh-user", frames: [frame] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.frames)).toBe(true);
    expect(body.frames).toHaveLength(1);
    expect(body.frames[0].timeSec).toBe(1.0);
    expect(typeof body.frames[0].score).toBe("number");
    expect(body.remaining).toBe(FREE_EXPORT_LIMIT - 1);
  });

  it("authorizes a credit-backed export once monthly quota is exhausted and reports remaining=0 (not the -1 Pro sentinel)", async () => {
    // A free user who has spent all 5 monthly exports but bought a credit pack: checkExportAllowed
    // returns { allowed:true, viaCredit:true, isPro:false, remaining:0 }. The route's response calc
    // is `decision.isPro ? -1 : Math.max(0, decision.remaining - 1)` → Math.max(0, 0-1) = 0. The
    // Math.max floor is ONLY exercised at this boundary — the fresh-user test drives remaining 5→4,
    // never the 0→-1 clamp. A mutation dropping the floor would return -1, which iOS reads as the
    // Pro/unlimited sentinel — i.e. a paying credit user would be told they have unlimited exports.
    const userId = "ios-score-credit-user";
    __resetCeilingStoreForTests();
    for (let i = 0; i < FREE_EXPORT_LIMIT; i++) await consumeExport({ userId }); // exhaust monthly
    await grantCredits(userId, 3, "txn-ios-score-credit"); // buys a credit pack
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: '[{"index":0,"score":0.9,"role":"HERO","label":"x"}]' }],
          usage: { input_tokens: 10, output_tokens: 2 },
        }),
        { status: 200 },
      ),
    );
    // Distinct IP so this request doesn't hit the shared per-IP PAID_RATE_LIMIT bucket the other
    // same-IP tests in this file collectively fill.
    const creditReq = new Request("http://localhost/api/ios-score", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "203.0.113.9" },
      body: JSON.stringify({ userId, frames: [frame] }),
    });
    const res = await POST(creditReq);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.remaining).toBe(0); // NOT -1
    // The export spent one purchased credit (monthly counter is already maxed), not free quota.
    expect(await getCreditBalance(userId)).toBe(2);
  });

  it("logs a [CostMeter] line with the per-export Anthropic token usage (COGS observability)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: '[{"index":0,"score":0.5,"role":"HERO","label":"x"}]' }],
          usage: { input_tokens: 1234, output_tokens: 56 },
        }),
        { status: 200 },
      ),
    );
    const res = await POST(req({ userId: "ios-score-meter-user", frames: [frame] }));
    expect(res.status).toBe(200);
    const meterLine = logSpy.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.includes("[CostMeter] ios-score:"));
    expect(meterLine).toBeTruthy();
    expect(meterLine).toContain("in=1234");
    expect(meterLine).toContain("out=56");
    expect(meterLine).toMatch(/est=\$\d/); // a real dollar estimate, not NaN/undefined
  });

  it("retries a transient 429 from Anthropic and then succeeds (no permanent export failure)", async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        return new Response("", { status: 429, headers: { "retry-after": "1" } });
      }
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: '[{"index":0,"score":0.7,"role":"HERO","label":"x"}]' }],
          usage: { input_tokens: 10, output_tokens: 2 },
        }),
        { status: 200 },
      );
    });
    const p = POST(req({ userId: "ios-score-retry-user", frames: [frame] }));
    await vi.runAllTimersAsync(); // let the backoff sleep elapse
    const res = await p;
    expect(res.status).toBe(200);
    expect(calls).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });

  it("retries a 200 with an unparseable body and then succeeds (transient corruption ≠ export failure)", async () => {
    // Before the fix, response.json() on a corrupt 200 threw uncaught out of the batch scorer.
    // Now it is treated like a thrown fetch: retry, and only fail after retries are exhausted.
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls++;
      if (calls === 1) return new Response("<<not json>>", { status: 200 });
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: '[{"index":0,"score":0.7,"role":"HERO","label":"x"}]' }],
          usage: { input_tokens: 10, output_tokens: 2 },
        }),
        { status: 200 },
      );
    });
    const res = await POST(req({ userId: "ios-score-parse-retry-user", frames: [frame] }));
    expect(res.status).toBe(200);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
