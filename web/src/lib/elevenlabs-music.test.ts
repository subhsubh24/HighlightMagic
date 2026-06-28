import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
vi.stubEnv("ELEVENLABS_API_KEY", "test-music-key");

describe("elevenlabs-music — generateMusic (success path)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("calls the correct ElevenLabs music compose endpoint", async () => {
    const audioBytes = new Uint8Array(24_000); // 1 second at 192kbps
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    await generateMusic("upbeat sports rock", 30_000);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/music/compose");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers["xi-api-key"]).toBe("test-music-key");
  });

  it("sends correct body fields (prompt, music_length_ms, output_format)", async () => {
    const audioBytes = new Uint8Array(1);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    await generateMusic("cinematic tension build", 45_000);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.prompt).toBe("cinematic tension build");
    expect(body.music_length_ms).toBe(45_000);
    expect(body.output_format).toBe("mp3_44100_192");
  });

  it("returns completed status with base64 data URI on success", async () => {
    const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    const result = await generateMusic("hype anthem");

    expect(result.status).toBe("completed");
    expect(result.audioUrl).toMatch(/^data:audio\/mpeg;base64,/);
    expect(result.error).toBeUndefined();
  });

  it("estimates duration as byteLength / 24000 (MP3 192kbps ≈ 24KB/s)", async () => {
    // 72000 bytes → ~3 seconds
    const audioBytes = new Uint8Array(72_000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    const result = await generateMusic("test", 30_000);

    expect(result.duration).toBe(3);
  });

  it("uses the default duration (60000ms) when none is provided", async () => {
    const audioBytes = new Uint8Array([1]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    await generateMusic("default duration test");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.music_length_ms).toBe(60_000);
  });
});

describe("elevenlabs-music — duration clamping", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("clamps a sub-minimum duration (1ms) up to the 3000ms floor", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    await generateMusic("short music", 1);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.music_length_ms).toBe(3_000);
  });

  it("clamps 0ms up to the 3000ms floor", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    await generateMusic("zero duration", 0);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.music_length_ms).toBe(3_000);
  });

  it("clamps a value exceeding 300s down to the 300000ms ceiling (cost control)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    await generateMusic("epic long track", 999_999_999);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.music_length_ms).toBe(300_000);
  });

  it("passes through a valid in-range duration (30000ms) unchanged", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    await generateMusic("valid range", 30_000);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.music_length_ms).toBe(30_000);
  });

  it("uses the default duration (60000ms) for NaN input", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    await generateMusic("nan duration", Number.NaN);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.music_length_ms).toBe(60_000);
  });

  it("uses the default duration (60000ms) for Infinity input", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    await generateMusic("infinite duration", Infinity);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.music_length_ms).toBe(60_000);
  });

  it("uses the default duration (60000ms) for -Infinity input", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    await generateMusic("negative infinite", -Infinity);

    // -Infinity is non-finite → safeDuration = 60000 → clamp(max(3000, min(60000, 300000))) = 60000
    // NOTE: the source uses Number.isFinite(-Infinity) → false, so safeDuration = DEFAULT_MUSIC_LENGTH_MS
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.music_length_ms).toBe(60_000);
  });
});

describe("elevenlabs-music — empty/error response handling", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns failed with 'Empty' message on a zero-byte audio response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    const result = await generateMusic("empty response", 30_000);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Empty");
    expect(result.audioUrl).toBeUndefined();
  });

  it("returns failed on a generic non-OK HTTP error (500)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    const result = await generateMusic("server error", 30_000);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("500");
  });

  it("returns failed on a 429 rate-limit error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Too Many Requests"),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    const result = await generateMusic("rate limited", 30_000);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("429");
  });

  it("returns failed gracefully when the error body is not valid JSON", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve("not json at all {{{"),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    const result = await generateMusic("bad json error", 30_000);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("400");
  });
});

describe("elevenlabs-music — bad_prompt retry logic", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("retries once with the API's prompt_suggestion when the first call is rejected as bad_prompt", async () => {
    const audioBytes = new Uint8Array([1, 2, 3, 4]);

    // First call: bad_prompt with a suggestion
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            detail: {
              status: "bad_prompt",
              message: "Cannot use artist or song names",
              data: { prompt_suggestion: "energetic upbeat sports track" },
            },
          })
        ),
    });

    // Second call (retry with suggestion): success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    const result = await generateMusic("play like Drake", 30_000);

    expect(result.status).toBe("completed");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Retry uses the suggested prompt
    const retryBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(retryBody.prompt).toBe("energetic upbeat sports track");
  });

  it("does NOT retry a second time on bad_prompt (_isRetry=true exhausts the retry bound)", async () => {
    // Simulate what happens when generateMusic is called with _isRetry=true
    // and the second call also fails with bad_prompt + suggestion
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              detail: {
                status: "bad_prompt",
                message: "Still not allowed",
                data: { prompt_suggestion: "yet another suggestion" },
              },
            })
          ),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              detail: {
                status: "bad_prompt",
                message: "Still not allowed",
                data: { prompt_suggestion: "yet another suggestion again" },
              },
            })
          ),
      });

    const { generateMusic } = await import("./elevenlabs-music");
    // Original prompt → retry with suggestion → that also hits bad_prompt → no further retry
    const result = await generateMusic("explicit artist mention", 30_000);

    expect(result.status).toBe("failed");
    // Max of 2 fetch calls total (1 original + 1 retry), no third attempt
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry when bad_prompt has no prompt_suggestion in the response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            detail: {
              status: "bad_prompt",
              message: "Content policy violation",
              // No data.prompt_suggestion field
            },
          })
        ),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    const result = await generateMusic("inappropriate content", 30_000);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Content policy violation");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry when the prompt_suggestion is identical to the original prompt", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            detail: {
              status: "bad_prompt",
              message: "Cannot use this",
              data: { prompt_suggestion: "same prompt" }, // same as input
            },
          })
        ),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    const result = await generateMusic("same prompt", 30_000);

    expect(result.status).toBe("failed");
    // No retry since suggestion === original prompt
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("preserves the original durationMs in the retry call", async () => {
    const audioBytes = new Uint8Array([7, 8, 9]);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            detail: {
              status: "bad_prompt",
              message: "Not allowed",
              data: { prompt_suggestion: "clean sports anthem" },
            },
          })
        ),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    await generateMusic("song by some artist", 45_000);

    const retryBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(retryBody.music_length_ms).toBe(45_000);
  });

  it("uses the detail.message from bad_prompt when no suggestion is available", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            detail: {
              status: "bad_prompt",
              message: "Try different wording — no artist names",
            },
          })
        ),
    });

    const { generateMusic } = await import("./elevenlabs-music");
    const result = await generateMusic("Beatles tribute", 30_000);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("artist");
  });
});

describe("elevenlabs-music — missing API key", () => {
  it("throws when ELEVENLABS_API_KEY is not set", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");

    const { generateMusic } = await import("./elevenlabs-music");
    await expect(generateMusic("no key prompt")).rejects.toThrow(
      "ELEVENLABS_API_KEY"
    );

    // Restore for subsequent tests
    vi.stubEnv("ELEVENLABS_API_KEY", "test-music-key");
  });
});
