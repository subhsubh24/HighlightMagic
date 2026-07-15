import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST as validatePOST } from "@/app/api/validate/route";
import { POST as iosValidatePOST } from "@/app/api/ios-validate/route";

/**
 * P0 — per-export API cost metering on the two validation call sites.
 *
 * Both /api/validate (streaming) and /api/ios-validate (non-streaming) fire a paid
 * Anthropic Haiku call. These tests assert each logs a `[CostMeter] ...` line with the
 * real token usage + an estimated USD cost, closing the previously-unmetered blind spot
 * on the COGS path (which is the freemium margin).
 */

/** Build a fake streaming Response whose body yields the given SSE event objects. */
function streamingResponse(events: object[]): Response {
  const lines = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
  const bytes = new TextEncoder().encode(lines);
  let sent = false;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          read: async () => {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          },
        };
      },
    },
  } as unknown as Response;
}

describe("[CostMeter] /api/validate (streaming)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs estimated cost from streamed token usage", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamingResponse([
          { type: "message_start", message: { usage: { input_tokens: 1200, output_tokens: 1 } } },
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: '{"passed":true,"issues":[],"fixes":{}}' },
          },
          { type: "message_delta", usage: { output_tokens: 50 } },
        ])
      )
    );

    const req = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clips: [{ id: "c1", startTime: 0, endTime: 5 }], plan: {} }),
    });
    const res = await validatePOST(req);
    expect(res.status).toBe(200);

    const meterLine = logSpy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes("[CostMeter] api/validate:"));
    expect(meterLine).toBeDefined();
    expect(meterLine).toContain("in=1200");
    expect(meterLine).toContain("out=50");
    // Non-zero estimate proves CLAUDE_VALIDATOR resolves to a priced model in the
    // cost map (a missing price would silently log est=$0.0000 and defeat metering).
    const est = Number(meterLine!.match(/est=\$([0-9.]+)/)?.[1]);
    expect(est).toBeGreaterThan(0);
  });

  it("marks the static validator system prompt as ephemeral-cacheable to cut input-token COGS", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(
      streamingResponse([
        { type: "message_start", message: { usage: { input_tokens: 1200, output_tokens: 1 } } },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: '{"passed":true,"issues":[],"fixes":{}}' },
        },
        { type: "message_delta", usage: { output_tokens: 50 } },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clips: [{ id: "c1", startTime: 0, endTime: 5 }], plan: {} }),
    });
    await validatePOST(req);

    // The Anthropic call must send `system` as a block array whose (single, static-instructions)
    // block carries cache_control:ephemeral — a plain string is uncacheable and re-bills the full
    // system prefix on every export's validation call. The per-request tape rides in `messages`.
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
    expect(Array.isArray(body.system)).toBe(true);
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(typeof body.system[0].text).toBe("string");
    expect(body.system[0].text.length).toBeGreaterThan(0);
    // The tape/frames must stay in messages, never the cached system block.
    expect(typeof body.messages[0].content === "string" || Array.isArray(body.messages[0].content)).toBe(true);
  });
});

describe("[CostMeter] /api/ios-validate (non-streaming)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs estimated cost from the response usage block", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: "text", text: '{"passed":true,"issues":[],"fixes":{}}' }],
          usage: { input_tokens: 800, output_tokens: 30 },
        }),
      })
    );

    const req = new Request("http://localhost/api/ios-validate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.42" },
      body: JSON.stringify({
        userId: "user-meter-test",
        clips: [{ captionText: "hi", durationSec: 3, filter: "none", transition: "cut", order: 0 }],
        contentSummary: "a test reel",
      }),
    });
    const res = await iosValidatePOST(req);
    expect(res.status).toBe(200);

    const meterLine = logSpy.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes("[CostMeter] ios-validate:"));
    expect(meterLine).toBeDefined();
    expect(meterLine).toContain("in=800");
    expect(meterLine).toContain("out=30");
    const est = Number(meterLine!.match(/est=\$([0-9.]+)/)?.[1]);
    expect(est).toBeGreaterThan(0);
  });
});
