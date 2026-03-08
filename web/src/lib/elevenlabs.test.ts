import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
vi.stubEnv("ELEVENLABS_API_KEY", "test-el-key");

describe("ElevenLabs TTS", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("resolves voice ID from character string", async () => {
    const { resolveVoiceId } = await import("./elevenlabs-tts");
    expect(resolveVoiceId("male-broadcaster-hype")).toBe(
      "pNInz6obpgDQGcFmaJgB"
    );
    expect(resolveVoiceId("female-narrator-warm")).toBe(
      "EXAVITQu4vr4xnSDxMaL"
    );
    // Unknown voice should return default (Adam)
    expect(resolveVoiceId("unknown-voice")).toBe("pNInz6obpgDQGcFmaJgB");
  });

  it("generates voiceover with correct API call", async () => {
    const audioData = new Uint8Array([0x49, 0x44, 0x33]); // fake MP3 header
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioData.buffer),
    });

    const { generateVoiceover } = await import("./elevenlabs-tts");
    const result = await generateVoiceover(
      "What a play!",
      "male-broadcaster-hype"
    );

    expect(result.status).toBe("completed");
    expect(result.audioUrl).toContain("data:audio/mpeg;base64,");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/text-to-speech/pNInz6obpgDQGcFmaJgB");
    expect(opts.headers["xi-api-key"]).toBe("test-el-key");
    const body = JSON.parse(opts.body);
    expect(body.text).toBe("What a play!");
    expect(body.model_id).toBe("eleven_flash_v2_5");
  });

  it("returns failed on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Rate limited"),
    });

    const { generateVoiceover } = await import("./elevenlabs-tts");
    const result = await generateVoiceover("test text");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("429");
  });

  it("returns failed on empty response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    const { generateVoiceover } = await import("./elevenlabs-tts");
    const result = await generateVoiceover("test text");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Empty");
  });

  it("generates multiple voiceovers sequentially", async () => {
    const audioData = new Uint8Array([1, 2, 3]);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(audioData.buffer),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(audioData.buffer),
      });

    const { generateVoiceovers } = await import("./elevenlabs-tts");
    const results = await generateVoiceovers([
      { text: "First clip", clipIndex: 0 },
      { text: "Second clip", clipIndex: 1 },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].clipIndex).toBe(0);
    expect(results[1].clipIndex).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("ElevenLabs Music", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("generates music with correct parameters", async () => {
    const audioData = new Uint8Array(16000); // ~1s of MP3
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioData.buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    const result = await generateMusic("upbeat sports rock", 30_000);

    expect(result.status).toBe("completed");
    expect(result.audioUrl).toContain("data:audio/mpeg;base64,");
    expect(result.duration).toBeGreaterThan(0);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.prompt).toBe("upbeat sports rock");
    expect(body.music_length_ms).toBe(30_000);
    expect(body.output_format).toBe("mp3_44100_128");
  });

  it("clamps duration to valid range", async () => {
    const audioData = new Uint8Array(1);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioData.buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    await generateMusic("test", 1); // Under 3000ms minimum

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.music_length_ms).toBe(3_000);
  });

  it("handles bad_prompt rejection", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            detail: {
              status: "bad_prompt",
              message: "Cannot use artist names",
            },
          })
        ),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    const result = await generateMusic("play like Drake");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Cannot use artist names");
  });
});

describe("ElevenLabs SFX", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("generates a sound effect", async () => {
    const audioData = new Uint8Array(4000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioData.buffer),
    });

    const { generateSoundEffect } = await import("./elevenlabs-sfx");
    const result = await generateSoundEffect("whoosh transition", 2000);

    expect(result.status).toBe("completed");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toBe("whoosh transition");
    expect(body.duration_seconds).toBe(2);
  });

  it("clamps SFX duration", async () => {
    const audioData = new Uint8Array(1);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioData.buffer),
    });

    const { generateSoundEffect } = await import("./elevenlabs-sfx");
    await generateSoundEffect("test", 100); // Under 500ms minimum

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.duration_seconds).toBe(0.5);
  });

  it("generates a batch of SFX in parallel", async () => {
    const audioData = new Uint8Array(1000);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioData.buffer),
    });

    const { generateSoundEffectBatch } = await import("./elevenlabs-sfx");
    const results = await generateSoundEffectBatch([
      { prompt: "whoosh", durationMs: 1000 },
      { prompt: "impact", durationMs: 500 },
      { prompt: "crowd roar" },
    ]);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "completed")).toBe(true);
  });
});

describe("ElevenLabs Voice Clone", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("creates a voice clone and returns voice ID", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ voice_id: "vc_abc123" }),
    });

    const { createVoiceClone } = await import("./elevenlabs-voice-clone");
    const audioBlob = new Blob([new Uint8Array(1000)], { type: "audio/mpeg" });
    const result = await createVoiceClone(audioBlob, "My Voice");

    expect(result.status).toBe("completed");
    expect(result.voiceId).toBe("vc_abc123");
  });

  it("deletes a voice clone", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const { deleteVoiceClone } = await import("./elevenlabs-voice-clone");
    await deleteVoiceClone("vc_abc123");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/voices/vc_abc123");
    expect(opts.method).toBe("DELETE");
  });

  it("generates TTS with cloned voice", async () => {
    const audioData = new Uint8Array([1, 2, 3]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioData.buffer),
    });

    const { generateWithClonedVoice } = await import(
      "./elevenlabs-voice-clone"
    );
    const result = await generateWithClonedVoice("Hello world", "vc_abc123");

    expect(result.status).toBe("completed");
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/text-to-speech/vc_abc123");
  });
});

describe("ElevenLabs Scribe", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("transcribes audio with word-level timing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          text: "Hello world",
          language_code: "en",
          words: [
            { text: "Hello", start: 0.0, end: 0.5, confidence: 0.99 },
            { text: "world", start: 0.6, end: 1.0, confidence: 0.95 },
          ],
        }),
    });

    const { transcribeAudio } = await import("./elevenlabs-scribe");
    const audioBuffer = Buffer.from([1, 2, 3]);
    const result = await transcribeAudio(audioBuffer, "test.mp3");

    expect(result.status).toBe("completed");
    expect(result.text).toBe("Hello world");
    expect(result.language).toBe("en");
    expect(result.segments).toHaveLength(1);
    expect(result.segments![0].words).toHaveLength(2);
  });

  it("splits segments on pauses > 1 second", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          text: "First Second",
          words: [
            { text: "First", start: 0.0, end: 0.5 },
            { text: "Second", start: 2.0, end: 2.5 }, // 1.5s gap
          ],
        }),
    });

    const { transcribeAudio } = await import("./elevenlabs-scribe");
    const result = await transcribeAudio(Buffer.from([1]));

    expect(result.segments).toHaveLength(2);
    expect(result.segments![0].text).toBe("First");
    expect(result.segments![1].text).toBe("Second");
  });
});

describe("ElevenLabs Stems", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("separates stems from audio", async () => {
    const instrumentalData = new Uint8Array(5000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(instrumentalData.buffer),
    });

    const { separateStems } = await import("./elevenlabs-stems");
    const result = await separateStems(Buffer.from([1, 2, 3]));

    expect(result.status).toBe("completed");
    expect(result.stems).toBeDefined();
    expect(result.stems!.drums).toContain("data:audio/mpeg;base64,");
  });

  it("isolates instrumental from data URI", async () => {
    const instrumentalData = new Uint8Array(3000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(instrumentalData.buffer),
    });

    const { isolateInstrumental } = await import("./elevenlabs-stems");
    const result = await isolateInstrumental(
      "data:audio/mpeg;base64,AAAA"
    );

    expect(result.status).toBe("completed");
    expect(result.instrumentalUrl).toContain("data:audio/mpeg;base64,");
  });

  it("handles invalid data URI", async () => {
    const { isolateInstrumental } = await import("./elevenlabs-stems");
    const result = await isolateInstrumental("not-a-data-uri");

    expect(result.status).toBe("failed");
  });
});
