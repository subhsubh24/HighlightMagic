/**
 * API route handler tests.
 *
 * Tests input validation, error handling, and response shapes for all API routes.
 * External service calls are mocked at the module level.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all external dependencies ──

vi.mock("@/lib/elevenlabs-sfx", () => ({
  generateSoundEffect: vi.fn(),
}));
vi.mock("@/lib/elevenlabs-tts", () => ({
  generateVoiceover: vi.fn(),
}));
vi.mock("@/lib/elevenlabs-scribe", () => ({
  transcribeAudio: vi.fn(),
}));
vi.mock("@/lib/elevenlabs-stems", () => ({
  isolateInstrumental: vi.fn(),
}));
vi.mock("@/lib/elevenlabs-voice-clone", () => ({
  createVoiceClone: vi.fn(),
}));
vi.mock("@/lib/atlascloud", () => ({
  submitTextToVideo: vi.fn(),
  submitPhotoAnimation: vi.fn(),
  submitBackgroundRemoval: vi.fn(),
  submitImageUpscale: vi.fn(),
  submitStyleTransfer: vi.fn(),
  submitLipSync: vi.fn(),
}));
vi.mock("@/lib/sfx-library", () => ({
  lookupSfxLibrary: vi.fn(() => null),
  cacheSfxResult: vi.fn(),
}));

// ── Helper to create a mock Request ──

function jsonRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ── SFX Route ──

describe("POST /api/sfx", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when prompt is missing", async () => {
    const { POST } = await import("@/app/api/sfx/route");
    const res = await POST(jsonRequest({ durationMs: 2000 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("prompt");
  });

  it("returns 400 when prompt is too long", async () => {
    const { POST } = await import("@/app/api/sfx/route");
    const res = await POST(jsonRequest({ prompt: "x".repeat(501) }));
    expect(res.status).toBe(400);
  });

  it("returns completed result on success", async () => {
    const { generateSoundEffect } = await import("@/lib/elevenlabs-sfx");
    (generateSoundEffect as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: "completed",
      audioUrl: "data:audio/mpeg;base64,abc",
      duration: 2,
    });

    const { POST } = await import("@/app/api/sfx/route");
    const res = await POST(jsonRequest({ prompt: "whoosh" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("completed");
    expect(data.audioUrl).toContain("base64");
  });

  it("returns 502 when generation fails", async () => {
    const { generateSoundEffect } = await import("@/lib/elevenlabs-sfx");
    (generateSoundEffect as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: "failed",
      error: "API error",
    });

    const { POST } = await import("@/app/api/sfx/route");
    const res = await POST(jsonRequest({ prompt: "boom" }));
    expect(res.status).toBe(502);
  });
});

// ── Voiceover Route ──

describe("POST /api/voiceover", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when text is missing", async () => {
    const { POST } = await import("@/app/api/voiceover/route");
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when text is too long", async () => {
    const { POST } = await import("@/app/api/voiceover/route");
    const res = await POST(jsonRequest({ text: "x".repeat(1001) }));
    expect(res.status).toBe(400);
  });

  it("returns completed result", async () => {
    const { generateVoiceover } = await import("@/lib/elevenlabs-tts");
    (generateVoiceover as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: "completed",
      audioUrl: "data:audio/mpeg;base64,abc",
      duration: 3,
    });

    const { POST } = await import("@/app/api/voiceover/route");
    const res = await POST(jsonRequest({ text: "What a play!", voiceCharacter: "male-broadcaster-hype" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("completed");
  });
});

// ── Intro Route ──

describe("POST /api/intro", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when prompt is missing", async () => {
    const { POST } = await import("@/app/api/intro/route");
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when prompt is too long", async () => {
    const { POST } = await import("@/app/api/intro/route");
    const res = await POST(jsonRequest({ prompt: "x".repeat(1001) }));
    expect(res.status).toBe(400);
  });

  it("returns prediction ID on success", async () => {
    const { submitTextToVideo } = await import("@/lib/atlascloud");
    (submitTextToVideo as ReturnType<typeof vi.fn>).mockResolvedValueOnce("pred_intro_123");

    const { POST } = await import("@/app/api/intro/route");
    const res = await POST(jsonRequest({ prompt: "Epic intro card", duration: 5 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.predictionId).toBe("pred_intro_123");
  });
});

// ── Thumbnail Route ──

describe("POST /api/thumbnail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when imageData is missing", async () => {
    const { POST } = await import("@/app/api/thumbnail/route");
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns prediction ID on success", async () => {
    const { submitBackgroundRemoval } = await import("@/lib/atlascloud");
    (submitBackgroundRemoval as ReturnType<typeof vi.fn>).mockResolvedValueOnce("pred_thumb_456");

    const { POST } = await import("@/app/api/thumbnail/route");
    const res = await POST(jsonRequest({ imageData: "data:image/jpeg;base64,abc" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.predictionId).toBe("pred_thumb_456");
  });
});

// ── Upscale Route ──

describe("POST /api/upscale", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when imageData is missing", async () => {
    const { POST } = await import("@/app/api/upscale/route");
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns prediction ID on success", async () => {
    const { submitImageUpscale } = await import("@/lib/atlascloud");
    (submitImageUpscale as ReturnType<typeof vi.fn>).mockResolvedValueOnce("pred_up_789");

    const { POST } = await import("@/app/api/upscale/route");
    const res = await POST(jsonRequest({ imageData: "data:image/jpeg;base64,abc" }));
    const data = await res.json();
    expect(data.predictionId).toBe("pred_up_789");
  });
});

// ── Style Transfer Route ──

describe("POST /api/style-transfer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when videoUrl is missing", async () => {
    const { POST } = await import("@/app/api/style-transfer/route");
    const res = await POST(jsonRequest({ stylePrompt: "cinematic" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when stylePrompt is missing", async () => {
    const { POST } = await import("@/app/api/style-transfer/route");
    const res = await POST(jsonRequest({ videoUrl: "https://example.com/v.mp4" }));
    expect(res.status).toBe(400);
  });

  it("returns prediction ID with clamped strength", async () => {
    const { submitStyleTransfer } = await import("@/lib/atlascloud");
    (submitStyleTransfer as ReturnType<typeof vi.fn>).mockResolvedValueOnce("pred_st_101");

    const { POST } = await import("@/app/api/style-transfer/route");
    const res = await POST(jsonRequest({
      videoUrl: "https://example.com/v.mp4",
      stylePrompt: "teal and orange cinematic",
      strength: 1.5, // Should be clamped to 1.0
    }));
    const data = await res.json();
    expect(data.predictionId).toBe("pred_st_101");

    // Verify strength was clamped
    expect((submitStyleTransfer as ReturnType<typeof vi.fn>).mock.calls[0][2]).toBe(1.0);
  });
});

// ── Talking Head Route ──

describe("POST /api/talking-head", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when imageData is missing", async () => {
    const { POST } = await import("@/app/api/talking-head/route");
    const res = await POST(jsonRequest({ audioData: "data:audio/mp3;base64,abc" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when audioData is missing", async () => {
    const { POST } = await import("@/app/api/talking-head/route");
    const res = await POST(jsonRequest({ imageData: "data:image/jpeg;base64,abc" }));
    expect(res.status).toBe(400);
  });

  it("returns prediction ID on success", async () => {
    const { submitLipSync } = await import("@/lib/atlascloud");
    (submitLipSync as ReturnType<typeof vi.fn>).mockResolvedValueOnce("pred_th_202");

    const { POST } = await import("@/app/api/talking-head/route");
    const res = await POST(jsonRequest({
      imageData: "data:image/jpeg;base64,abc",
      audioData: "data:audio/mp3;base64,xyz",
      duration: 7,
    }));
    const data = await res.json();
    expect(data.predictionId).toBe("pred_th_202");
  });
});

// ── Stems Route ──

describe("POST /api/stems", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when musicDataUri is missing", async () => {
    const { POST } = await import("@/app/api/stems/route");
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns instrumental URL on success", async () => {
    const { isolateInstrumental } = await import("@/lib/elevenlabs-stems");
    (isolateInstrumental as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: "completed",
      instrumentalUrl: "data:audio/mpeg;base64,instrumental",
    });

    const { POST } = await import("@/app/api/stems/route");
    const res = await POST(jsonRequest({ musicDataUri: "data:audio/mpeg;base64,abc" }));
    const data = await res.json();
    expect(data.status).toBe("completed");
    expect(data.instrumentalUrl).toContain("instrumental");
  });
});

// ── Render Route ──

describe("POST /api/render", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RENDER_ENABLED", "false");
  });

  it("returns 501 when rendering is disabled", async () => {
    const { POST } = await import("@/app/api/render/route");
    const res = await POST(jsonRequest({
      clips: [{ sourceUrl: "https://example.com/v.mp4", startTime: 0, endTime: 5 }],
      audioLayers: [],
      width: 1080,
      height: 1920,
      fps: 30,
      bitrate: 12_000_000,
    }));
    expect(res.status).toBe(501);
  });

  it("returns 400 for invalid EDL (no clips)", async () => {
    vi.stubEnv("RENDER_ENABLED", "true");
    const { POST } = await import("@/app/api/render/route");
    const res = await POST(jsonRequest({
      clips: [],
      audioLayers: [],
      width: 1080,
      height: 1920,
      fps: 30,
      bitrate: 12_000_000,
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing dimensions", async () => {
    vi.stubEnv("RENDER_ENABLED", "true");
    const { POST } = await import("@/app/api/render/route");
    const res = await POST(jsonRequest({
      clips: [{ sourceUrl: "https://example.com/v.mp4", startTime: 0, endTime: 5 }],
      audioLayers: [],
    }));
    expect(res.status).toBe(400);
  });
});
