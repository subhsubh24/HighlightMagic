import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// COGS metering is a side effect we assert fires; mock it so we can spy without a real meter.
vi.mock("@/lib/usage-meter", () => ({ logProviderUsage: vi.fn() }));

import { generateMusic } from "./elevenlabs-music";
import { logProviderUsage } from "@/lib/usage-meter";

/** Audio Response stand-in (compose endpoint streams MP3 bytes back). */
function audioResponse(bytes: number, ok = true, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: async () => new ArrayBuffer(bytes),
    text: async () => "",
  } as unknown as Response;
}

/** Error Response whose text() body is a JSON string (ElevenLabs error envelope). */
function jsonErrorResponse(body: unknown, status = 400): Response {
  return {
    ok: false,
    status,
    arrayBuffer: async () => new ArrayBuffer(0),
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("generateMusic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns completed audio + estimated duration and calls the compose endpoint", async () => {
    // 48000 bytes at ~24KB/s ≈ 2s.
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(48_000));
    vi.stubGlobal("fetch", fetchMock);

    const r = await generateMusic("uplifting cinematic build");

    expect(r.status).toBe("completed");
    expect(r.audioUrl).toMatch(/^data:audio\/mpeg;base64,/);
    expect(r.duration).toBe(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/music/compose");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ "xi-api-key": "test-key" });
  });

  it("meters COGS by requested track length in seconds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(24_000)));

    await generateMusic("lofi beat", 30_000);

    expect(logProviderUsage as Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "elevenlabs",
        op: "music",
        unit: "seconds",
        units: 30, // 30000ms / 1000
      })
    );
  });

  it("clamps requested length into [3000ms, 300000ms] in the request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(8_000));
    vi.stubGlobal("fetch", fetchMock);

    await generateMusic("over-long track", 999_999); // → 300000ms
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).music_length_ms).toBe(300_000);

    await generateMusic("too-short track", 100); // → 3000ms
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string).music_length_ms).toBe(3_000);
  });

  it("falls back to the 60s default when duration is not finite", async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(8_000));
    vi.stubGlobal("fetch", fetchMock);

    await generateMusic("default length", Number.NaN);

    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).music_length_ms).toBe(60_000);
  });

  it("retries ONCE with ElevenLabs' sanitized prompt suggestion on a bad_prompt error", async () => {
    const fetchMock = vi
      .fn()
      // First call: prompt rejected, API returns a suggestion.
      .mockResolvedValueOnce(
        jsonErrorResponse({
          detail: {
            status: "bad_prompt",
            message: "rejected",
            data: { prompt_suggestion: "instrumental cinematic build" },
          },
        })
      )
      // Retry with the suggestion succeeds.
      .mockResolvedValueOnce(audioResponse(24_000));
    vi.stubGlobal("fetch", fetchMock);

    const r = await generateMusic("Taylor Swift style anthem");

    expect(r.status).toBe("completed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The retry sent the sanitized suggestion, not the original prompt.
    const retryBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(retryBody.prompt).toBe("instrumental cinematic build");
  });

  it("does NOT recurse a second time — a bad_prompt on the retry surfaces as failed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonErrorResponse({
        detail: {
          status: "bad_prompt",
          message: "still rejected",
          data: { prompt_suggestion: "another suggestion" },
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await generateMusic("bad prompt", 60_000);

    expect(r.status).toBe("failed");
    // Exactly one retry: original + one suggestion attempt, never an infinite loop.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.error).toContain("still rejected");
  });

  it("returns a generic failed result on a non-bad_prompt API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonErrorResponse({ detail: "server error" }, 500)));

    const r = await generateMusic("anything");

    expect(r.status).toBe("failed");
    expect(r.error).toContain("500");
    expect(logProviderUsage as Mock).not.toHaveBeenCalled();
  });

  it("returns failed on an empty (0-byte) audio buffer without metering", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(0, true, 200)));

    const r = await generateMusic("silent");

    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/empty/i);
    expect(logProviderUsage as Mock).not.toHaveBeenCalled();
  });

  it("throws a clear, actionable error when the API key is missing", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());

    await expect(generateMusic("no key")).rejects.toThrow(/ELEVENLABS_API_KEY/);
  });
});
