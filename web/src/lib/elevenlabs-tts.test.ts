import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// COGS metering is a side effect we assert fires; mock it so we can spy without a real meter.
vi.mock("@/lib/usage-meter", () => ({ logProviderUsage: vi.fn() }));

import { generateVoiceover, generateVoiceovers, resolveVoiceId } from "./elevenlabs-tts";
import { logProviderUsage } from "@/lib/usage-meter";

/** Build a minimal fetch Response stand-in for the TTS endpoint (returns audio bytes). */
function audioResponse(bytes: number, ok = true, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: async () => new ArrayBuffer(bytes),
    text: async () => "",
  } as unknown as Response;
}

describe("resolveVoiceId", () => {
  it("maps a known voice character to its ElevenLabs voice ID", () => {
    // Adam — the mapped ID for the default broadcaster character.
    expect(resolveVoiceId("male-broadcaster-hype")).toBe("pNInz6obpgDQGcFmaJgB");
    expect(resolveVoiceId("female-narrator-warm")).toBe("EXAVITQu4vr4xnSDxMaL");
  });

  it("falls back to the default voice for an unknown character (never crashes)", () => {
    expect(resolveVoiceId("nonexistent-character")).toBe("pNInz6obpgDQGcFmaJgB");
    expect(resolveVoiceId("")).toBe("pNInz6obpgDQGcFmaJgB");
  });
});

describe("generateVoiceover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns completed audio + estimated duration and calls the TTS voice endpoint", async () => {
    // 32000 bytes at ~16KB/s ≈ 2s.
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(32_000));
    vi.stubGlobal("fetch", fetchMock);

    const r = await generateVoiceover("Hello world", "male-broadcaster-hype");

    expect(r.status).toBe("completed");
    expect(r.audioUrl).toMatch(/^data:audio\/mpeg;base64,/);
    expect(r.duration).toBe(2);
    // Routed to the resolved voice ID, POST with the api key header.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/text-to-speech/pNInz6obpgDQGcFmaJgB");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ "xi-api-key": "test-key" });
  });

  it("meters COGS per input character (business observability)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(16_000)));

    await generateVoiceover("abcdef", "female-young-energetic");

    expect(logProviderUsage as Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "elevenlabs",
        op: "tts",
        unit: "chars",
        units: 6, // "abcdef".length
      }),
    );
  });

  it("returns a failed result (not a throw) on an API error, without metering cost", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(0, false, 401)));

    const r = await generateVoiceover("hi");

    expect(r.status).toBe("failed");
    expect(r.error).toContain("401");
    expect(r.audioUrl).toBeUndefined();
    expect(logProviderUsage as Mock).not.toHaveBeenCalled();
  });

  it("rejects an empty (0-byte) audio response instead of returning a broken data URI", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(0)));

    const r = await generateVoiceover("hi");

    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/empty audio/i);
    expect(logProviderUsage as Mock).not.toHaveBeenCalled();
  });

  it("throws a clear configuration error when the API key is missing", async () => {
    vi.unstubAllEnvs(); // remove ELEVENLABS_API_KEY
    vi.stubGlobal("fetch", vi.fn());

    await expect(generateVoiceover("hi")).rejects.toThrow(/ELEVENLABS_API_KEY is not configured/);
  });
});

describe("generateVoiceovers (batch)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("renders every segment and preserves the clipIndex mapping", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(16_000)));

    const results = await generateVoiceovers([
      { text: "one", clipIndex: 0 },
      { text: "two", clipIndex: 2 },
    ]);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.clipIndex)).toEqual([0, 2]);
    expect(results.every((r) => r.result.status === "completed")).toBe(true);
  });
});
