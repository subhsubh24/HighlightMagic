import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
vi.stubEnv("ELEVENLABS_API_KEY", "test-tts-key");

describe("elevenlabs-tts — resolveVoiceId", () => {
  it("maps male-broadcaster-hype to Adam voice ID", async () => {
    const { resolveVoiceId } = await import("./elevenlabs-tts");
    expect(resolveVoiceId("male-broadcaster-hype")).toBe("pNInz6obpgDQGcFmaJgB");
  });

  it("maps male-narrator-warm to Arnold voice ID", async () => {
    const { resolveVoiceId } = await import("./elevenlabs-tts");
    expect(resolveVoiceId("male-narrator-warm")).toBe("VR6AewLTigWG4xSOukaG");
  });

  it("maps male-young-energetic to Antoni voice ID", async () => {
    const { resolveVoiceId } = await import("./elevenlabs-tts");
    expect(resolveVoiceId("male-young-energetic")).toBe("ErXwobaYiN019PkySvjV");
  });

  it("maps female-narrator-warm to Bella voice ID", async () => {
    const { resolveVoiceId } = await import("./elevenlabs-tts");
    expect(resolveVoiceId("female-narrator-warm")).toBe("EXAVITQu4vr4xnSDxMaL");
  });

  it("maps female-broadcaster-hype to Emily voice ID", async () => {
    const { resolveVoiceId } = await import("./elevenlabs-tts");
    expect(resolveVoiceId("female-broadcaster-hype")).toBe("MF3mGyEYCl7XYWbV9V6O");
  });

  it("maps female-young-energetic to Jessie voice ID", async () => {
    const { resolveVoiceId } = await import("./elevenlabs-tts");
    expect(resolveVoiceId("female-young-energetic")).toBe("jBpfAIEiAdjNBVLkP4cg");
  });

  it("falls back to default (Adam) for an unknown voice character", async () => {
    const { resolveVoiceId } = await import("./elevenlabs-tts");
    expect(resolveVoiceId("robot-alien-weird")).toBe("pNInz6obpgDQGcFmaJgB");
  });

  it("falls back to default for an empty string voice character", async () => {
    const { resolveVoiceId } = await import("./elevenlabs-tts");
    expect(resolveVoiceId("")).toBe("pNInz6obpgDQGcFmaJgB");
  });
});

describe("elevenlabs-tts — generateVoiceover", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("calls the correct ElevenLabs TTS endpoint with resolved voice ID", async () => {
    const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04]); // fake MP3 header
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    const { generateVoiceover } = await import("./elevenlabs-tts");
    await generateVoiceover("Incredible move!", "male-broadcaster-hype");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/text-to-speech/pNInz6obpgDQGcFmaJgB");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers["xi-api-key"]).toBe("test-tts-key");
  });

  it("sends the correct request body (text, model_id, output_format, voice_settings)", async () => {
    const audioBytes = new Uint8Array([1, 2, 3]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    const { generateVoiceover } = await import("./elevenlabs-tts");
    await generateVoiceover("Slam dunk!", "female-broadcaster-hype");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toBe("Slam dunk!");
    expect(body.model_id).toBe("eleven_flash_v2_5");
    expect(body.output_format).toBe("mp3_44100_128");
    expect(body.voice_settings).toMatchObject({
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true,
    });
  });

  it("returns completed status with base64 data URI on success", async () => {
    const audioBytes = new Uint8Array([0x49, 0x44, 0x33]); // 3 bytes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    const { generateVoiceover } = await import("./elevenlabs-tts");
    const result = await generateVoiceover("What a save!", "female-narrator-warm");

    expect(result.status).toBe("completed");
    expect(result.audioUrl).toMatch(/^data:audio\/mpeg;base64,/);
    expect(result.error).toBeUndefined();
  });

  it("estimates duration as byteLength / 16000 (MP3 128kbps ≈ 16KB/s)", async () => {
    // 32000 bytes → ~2 seconds
    const audioBytes = new Uint8Array(32_000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    const { generateVoiceover } = await import("./elevenlabs-tts");
    const result = await generateVoiceover("test text");

    expect(result.duration).toBe(2);
  });

  it("uses the default voice (male-broadcaster-hype) when no voice character is provided", async () => {
    const audioBytes = new Uint8Array([1]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    const { generateVoiceover } = await import("./elevenlabs-tts");
    await generateVoiceover("default voice test");

    const [url] = mockFetch.mock.calls[0];
    // Should use Adam (default voice) ID
    expect(url).toContain("/text-to-speech/pNInz6obpgDQGcFmaJgB");
  });

  it("returns failed with status code on a non-OK API response (429 rate limit)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Too Many Requests"),
    });

    const { generateVoiceover } = await import("./elevenlabs-tts");
    const result = await generateVoiceover("rate limited text");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("429");
    expect(result.audioUrl).toBeUndefined();
    expect(result.duration).toBeUndefined();
  });

  it("returns failed with status code on a 401 unauthorized error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    const { generateVoiceover } = await import("./elevenlabs-tts");
    const result = await generateVoiceover("unauthorized text");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("401");
  });

  it("returns failed with status code on a 500 server error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const { generateVoiceover } = await import("./elevenlabs-tts");
    const result = await generateVoiceover("server error text");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("500");
  });

  it("returns failed with 'Empty' message on zero-byte audio response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    const { generateVoiceover } = await import("./elevenlabs-tts");
    const result = await generateVoiceover("empty response text");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Empty");
    expect(result.audioUrl).toBeUndefined();
  });

  it("uses the unknown voice character's fallback voice ID in the URL", async () => {
    const audioBytes = new Uint8Array([1, 2, 3]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    const { generateVoiceover } = await import("./elevenlabs-tts");
    await generateVoiceover("test text", "unknown-character-xyz");

    const [url] = mockFetch.mock.calls[0];
    // Falls back to Adam default ID
    expect(url).toContain("/text-to-speech/pNInz6obpgDQGcFmaJgB");
  });
});

describe("elevenlabs-tts — generateVoiceover (missing API key)", () => {
  it("throws when ELEVENLABS_API_KEY is not set", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");

    const { generateVoiceover } = await import("./elevenlabs-tts");
    await expect(generateVoiceover("no key")).rejects.toThrow(
      "ELEVENLABS_API_KEY"
    );

    // Restore key for subsequent tests
    vi.stubEnv("ELEVENLABS_API_KEY", "test-tts-key");
  });
});

describe("elevenlabs-tts — generateVoiceovers (batch)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("processes all segments and preserves clipIndex ordering", async () => {
    const audioBytes = new Uint8Array([1, 2, 3]);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(audioBytes.buffer),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(audioBytes.buffer),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(audioBytes.buffer),
      });

    const { generateVoiceovers } = await import("./elevenlabs-tts");
    const results = await generateVoiceovers(
      [
        { text: "First play", clipIndex: 0 },
        { text: "Second play", clipIndex: 1 },
        { text: "Third play", clipIndex: 2 },
      ],
      "male-broadcaster-hype"
    );

    expect(results).toHaveLength(3);
    expect(results[0].clipIndex).toBe(0);
    expect(results[1].clipIndex).toBe(1);
    expect(results[2].clipIndex).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("runs sequentially — each segment produces exactly one fetch call in order", async () => {
    const audioBytes = new Uint8Array([4, 5, 6]);
    const callOrder: string[] = [];

    mockFetch.mockImplementation(() => {
      callOrder.push("fetch");
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(audioBytes.buffer),
      });
    });

    const { generateVoiceovers } = await import("./elevenlabs-tts");
    await generateVoiceovers(
      [
        { text: "Alpha", clipIndex: 10 },
        { text: "Beta", clipIndex: 20 },
      ],
      "female-narrator-warm"
    );

    expect(callOrder).toEqual(["fetch", "fetch"]);
  });

  it("returns failed results inline for segments that error — does not abort the batch", async () => {
    const audioBytes = new Uint8Array([1, 2, 3]);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(audioBytes.buffer),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Server Error"),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(audioBytes.buffer),
      });

    const { generateVoiceovers } = await import("./elevenlabs-tts");
    const results = await generateVoiceovers(
      [
        { text: "Success", clipIndex: 0 },
        { text: "Failure", clipIndex: 1 },
        { text: "Success again", clipIndex: 2 },
      ],
      "male-broadcaster-hype"
    );

    expect(results).toHaveLength(3);
    expect(results[0].result.status).toBe("completed");
    expect(results[1].result.status).toBe("failed");
    expect(results[2].result.status).toBe("completed");
  });

  it("returns an empty array when given zero segments", async () => {
    const { generateVoiceovers } = await import("./elevenlabs-tts");
    const results = await generateVoiceovers([]);

    expect(results).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses default voice character when none is provided", async () => {
    const audioBytes = new Uint8Array([1]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    const { generateVoiceovers } = await import("./elevenlabs-tts");
    await generateVoiceovers([{ text: "default voice", clipIndex: 0 }]);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/text-to-speech/pNInz6obpgDQGcFmaJgB");
  });
});
