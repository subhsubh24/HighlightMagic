import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// COGS metering is a side effect we assert fires; mock it so we can spy without a real meter.
vi.mock("@/lib/usage-meter", () => ({ logProviderUsage: vi.fn() }));

import {
  generateSoundEffect,
  generateSoundEffectBatch,
  SFX_GENERATION_TIMEOUT_MS,
} from "./elevenlabs-sfx";
import { logProviderUsage } from "@/lib/usage-meter";

// The `/api/sfx` route runs with `maxDuration = 30` (30_000ms). B6/H10 requires the
// in-code abort to fire strictly BEFORE Vercel's platform kill, else the clean error
// path is dead code and the user sees an opaque "function timed out". Guard the budget.
const SFX_ROUTE_MAX_DURATION_MS = 30_000;

describe("SFX_GENERATION_TIMEOUT_MS (B6/H10 timeout headroom)", () => {
  it("fires strictly before the serverless budget", () => {
    expect(SFX_GENERATION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(SFX_GENERATION_TIMEOUT_MS).toBeLessThan(SFX_ROUTE_MAX_DURATION_MS);
  });
});

/** Build a minimal fetch Response stand-in for the SFX endpoint (returns audio bytes). */
function audioResponse(bytes: number, ok = true, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: async () => new ArrayBuffer(bytes),
    text: async () => "",
  } as unknown as Response;
}

describe("generateSoundEffect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns completed audio + estimated duration and calls the sound-generation endpoint", async () => {
    // 32000 bytes at ~16KB/s ≈ 2s.
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(32_000));
    vi.stubGlobal("fetch", fetchMock);

    const r = await generateSoundEffect("whoosh transition");

    expect(r.status).toBe("completed");
    expect(r.audioUrl).toMatch(/^data:audio\/mpeg;base64,/);
    expect(r.duration).toBe(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/sound-generation");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ "xi-api-key": "test-key" });
  });

  it("meters COGS by requested duration in seconds (business observability)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(16_000)));

    await generateSoundEffect("impact hit", 3_000);

    expect(logProviderUsage as Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "elevenlabs",
        op: "sfx",
        unit: "seconds",
        units: 3, // 3000ms / 1000
      })
    );
  });

  it("clamps the requested duration into [500ms, 10000ms] before billing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(8_000));
    vi.stubGlobal("fetch", fetchMock);

    // Over the max → clamped to 10s in both the request body and the meter.
    await generateSoundEffect("very long riser", 60_000);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.duration_seconds).toBe(10); // 10000ms clamp
    expect(logProviderUsage as Mock).toHaveBeenLastCalledWith(
      expect.objectContaining({ units: 10 })
    );

    // Under the min → clamped up to 500ms.
    await generateSoundEffect("tiny tick", 10);
    const body2 = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(body2.duration_seconds).toBe(0.5);
  });

  it("falls back to the 2000ms default when duration is not finite", async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(4_000));
    vi.stubGlobal("fetch", fetchMock);

    await generateSoundEffect("crowd roar", Number.NaN);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.duration_seconds).toBe(2); // 2000ms default
  });

  it("returns failed (never throws) on a non-OK API response and does NOT meter cost", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(0, false, 429)));

    const r = await generateSoundEffect("rate limited");

    expect(r.status).toBe("failed");
    expect(r.error).toContain("429");
    // COGS must not be logged for a call that produced no billable audio.
    expect(logProviderUsage as Mock).not.toHaveBeenCalled();
  });

  it("returns failed on an empty (0-byte) audio buffer without metering", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(0, true, 200)));

    const r = await generateSoundEffect("silent");

    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/empty/i);
    expect(logProviderUsage as Mock).not.toHaveBeenCalled();
  });

  it("throws a clear, actionable error when the API key is missing", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());

    await expect(generateSoundEffect("no key")).rejects.toThrow(/ELEVENLABS_API_KEY/);
  });
});

describe("generateSoundEffectBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("generates every requested effect in parallel, preserving order and per-request duration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(16_000));
    vi.stubGlobal("fetch", fetchMock);

    const results = await generateSoundEffectBatch([
      { prompt: "whoosh", durationMs: 1_000 },
      { prompt: "boom" }, // defaults to 2000ms
    ]);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "completed")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(firstBody.duration_seconds).toBe(1);
    expect(secondBody.duration_seconds).toBe(2);
  });
});
