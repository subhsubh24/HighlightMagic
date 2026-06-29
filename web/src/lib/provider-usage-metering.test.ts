/**
 * Verifies the COGS-observability wiring: every ElevenLabs / AtlasCloud paid
 * generation emits a `[CostMeter]` usage line carrying the cost driver, so
 * per-export COGS is reconcilable from the Vercel function logs (the LLM calls
 * already log [CostMeter]; this closes the audio/video blind spot).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
vi.stubEnv("ELEVENLABS_API_KEY", "test-el-key");
vi.stubEnv("ATLASCLOUD_API_KEY", "test-atlas-key");

function audioOk() {
  const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x05, 0x06]); // fake MP3
  return { ok: true, arrayBuffer: () => Promise.resolve(bytes.buffer) };
}

function costMeterLines(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls
    .map((c) => String(c[0]))
    .filter((l) => l.includes("[CostMeter]"));
}

describe("provider usage metering", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockFetch.mockReset();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("TTS emits a per-character [CostMeter] line on success", async () => {
    mockFetch.mockResolvedValueOnce(audioOk());
    const { generateVoiceover } = await import("./elevenlabs-tts");
    const res = await generateVoiceover("What a play!", "male-broadcaster-hype");
    expect(res.status).toBe("completed");
    const meter = costMeterLines(logSpy).find((l) => l.includes("elevenlabs-tts"));
    expect(meter).toBeTruthy();
    expect(meter).toContain(`chars=${"What a play!".length}`);
    logSpy.mockRestore();
  });

  it("SFX emits a per-second [CostMeter] line on success", async () => {
    mockFetch.mockResolvedValueOnce(audioOk());
    const { generateSoundEffect } = await import("./elevenlabs-sfx");
    const res = await generateSoundEffect("whoosh", 2000);
    expect(res.status).toBe("completed");
    const meter = costMeterLines(logSpy).find((l) => l.includes("elevenlabs-sfx"));
    expect(meter).toBeTruthy();
    expect(meter).toContain("seconds=2");
    logSpy.mockRestore();
  });

  it("Music emits a per-second [CostMeter] line on success", async () => {
    mockFetch.mockResolvedValueOnce(audioOk());
    const { generateMusic } = await import("./elevenlabs-music");
    const res = await generateMusic("cinematic build", 60000);
    expect(res.status).toBe("completed");
    const meter = costMeterLines(logSpy).find((l) => l.includes("elevenlabs-music"));
    expect(meter).toBeTruthy();
    expect(meter).toContain("seconds=60");
    logSpy.mockRestore();
  });

  it("AtlasCloud emits a per-job [CostMeter] line carrying the model", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: "pred_123" } }),
    });
    const { submitTask, MODELS } = await import("./atlascloud");
    const id = await submitTask(MODELS.KLING_I2V, { image: "x", prompt: "go", duration: 5 });
    expect(id).toBe("pred_123");
    const meter = costMeterLines(logSpy).find((l) => l.includes("atlascloud"));
    expect(meter).toBeTruthy();
    expect(meter).toContain("job=1");
    expect(meter).toContain(MODELS.KLING_I2V);
    expect(meter).toContain("duration=5");
    logSpy.mockRestore();
  });

  it("does NOT meter a failed generation (no cost driver logged)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve("err") });
    const { generateSoundEffect } = await import("./elevenlabs-sfx");
    const res = await generateSoundEffect("whoosh", 2000);
    expect(res.status).toBe("failed");
    expect(costMeterLines(logSpy).some((l) => l.includes("elevenlabs-sfx"))).toBe(false);
    logSpy.mockRestore();
  });
});
