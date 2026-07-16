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
vi.mock("@/lib/elevenlabs-scribe", () => ({}));
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
  submitLipSync: vi.fn(),
}));
vi.mock("@/lib/sfx-library", () => ({
  lookupSfxLibrary: vi.fn(() => null),
  cacheSfxResult: vi.fn(),
}));
vi.mock("@/lib/elevenlabs-music", () => ({
  generateMusic: vi.fn(),
}));
// Default: quota OK. Individual tests can override with mockResolvedValueOnce.
vi.mock("@/lib/entitlement", () => ({
  checkExportAllowed: vi.fn().mockResolvedValue({
    allowed: true, isPro: false, remaining: 4, limit: 5, used: 1,
  }),
  consumeExport: vi.fn().mockResolvedValue(2),
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

  it("returns 400 when userId is missing", async () => {
    const { POST } = await import("@/app/api/sfx/route");
    const res = await POST(jsonRequest({ prompt: "whoosh", durationMs: 2000 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("userId");
  });

  it("returns 400 when prompt is missing", async () => {
    const { POST } = await import("@/app/api/sfx/route");
    const res = await POST(jsonRequest({ userId: "test-user", durationMs: 2000 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("prompt");
  });

  it("returns 400 when prompt is too long", async () => {
    const { POST } = await import("@/app/api/sfx/route");
    const res = await POST(jsonRequest({ userId: "test-user", prompt: "x".repeat(501) }));
    expect(res.status).toBe(400);
  });

  it("returns 402 when quota is exceeded", async () => {
    const { checkExportAllowed } = await import("@/lib/entitlement");
    (checkExportAllowed as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false, isPro: false, remaining: 0, limit: 5, used: 5,
      reason: "free monthly limit reached",
    });
    const { POST } = await import("@/app/api/sfx/route");
    const res = await POST(jsonRequest({ userId: "test-user", prompt: "whoosh" }));
    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.upgrade).toBe(true);
  });

  it("returns a pre-generated library SFX without touching the paid gate or generator", async () => {
    // COGS fast-path: a library hit is instant + free. It MUST short-circuit before the
    // quota gate and the paid generator — otherwise a free pre-canned asset would burn a
    // user's quota and ElevenLabs COGS. This path was previously unexercised (the library
    // mock defaulted to a miss), so a regression in ordering or response shape was silent.
    const { lookupSfxLibrary } = await import("@/lib/sfx-library");
    (lookupSfxLibrary as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      url: "https://cdn.example/sfx/whoosh.mp3",
      duration: 1.5,
    });
    const { generateSoundEffect } = await import("@/lib/elevenlabs-sfx");
    const { checkExportAllowed } = await import("@/lib/entitlement");

    const { POST } = await import("@/app/api/sfx/route");
    const res = await POST(jsonRequest({ userId: "test-user", prompt: "whoosh" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("completed");
    expect(data.audioUrl).toBe("https://cdn.example/sfx/whoosh.mp3");
    expect(data.duration).toBe(1.5);
    expect(generateSoundEffect).not.toHaveBeenCalled(); // no paid call
    expect(checkExportAllowed).not.toHaveBeenCalled(); // no quota consumed for a free hit
  });

  it("returns completed result on success", async () => {
    const { generateSoundEffect } = await import("@/lib/elevenlabs-sfx");
    (generateSoundEffect as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: "completed",
      audioUrl: "data:audio/mpeg;base64,abc",
      duration: 2,
    });

    const { POST } = await import("@/app/api/sfx/route");
    const res = await POST(jsonRequest({ userId: "test-user", prompt: "whoosh" }));
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
    const res = await POST(jsonRequest({ userId: "test-user", prompt: "boom" }));
    expect(res.status).toBe(502);
  });
});

// ── Voiceover Route ──

describe("POST /api/voiceover", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when userId is missing", async () => {
    const { POST } = await import("@/app/api/voiceover/route");
    const res = await POST(jsonRequest({ text: "Nice shot!" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("userId");
  });

  it("returns 400 when text is missing", async () => {
    const { POST } = await import("@/app/api/voiceover/route");
    const res = await POST(jsonRequest({ userId: "test-user" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when text is too long", async () => {
    const { POST } = await import("@/app/api/voiceover/route");
    const res = await POST(jsonRequest({ userId: "test-user", text: "x".repeat(1001) }));
    expect(res.status).toBe(400);
  });

  it("returns 402 when quota is exceeded", async () => {
    const { checkExportAllowed } = await import("@/lib/entitlement");
    (checkExportAllowed as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false, isPro: false, remaining: 0, limit: 5, used: 5,
      reason: "free monthly limit reached",
    });
    const { POST } = await import("@/app/api/voiceover/route");
    const res = await POST(jsonRequest({ userId: "test-user", text: "Nice shot!" }));
    expect(res.status).toBe(402);
  });

  it("returns completed result", async () => {
    const { generateVoiceover } = await import("@/lib/elevenlabs-tts");
    (generateVoiceover as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: "completed",
      audioUrl: "data:audio/mpeg;base64,abc",
      duration: 3,
    });

    const { POST } = await import("@/app/api/voiceover/route");
    const res = await POST(jsonRequest({ userId: "test-user", text: "What a play!", voiceCharacter: "male-broadcaster-hype" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("completed");
  });
});

// ── Music Route ──

describe("POST /api/music/submit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when userId is missing", async () => {
    const { POST } = await import("@/app/api/music/submit/route");
    const res = await POST(jsonRequest({ prompt: "epic sports anthem" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("userId");
  });

  it("returns 400 when prompt is missing", async () => {
    const { POST } = await import("@/app/api/music/submit/route");
    const res = await POST(jsonRequest({ userId: "test-user" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("prompt");
  });

  it("returns 402 when quota is exceeded", async () => {
    const { checkExportAllowed } = await import("@/lib/entitlement");
    (checkExportAllowed as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false, isPro: false, remaining: 0, limit: 5, used: 5,
      reason: "free monthly limit reached",
    });
    const { POST } = await import("@/app/api/music/submit/route");
    const res = await POST(jsonRequest({ userId: "test-user", prompt: "epic sports anthem" }));
    expect(res.status).toBe(402);
  });

  it("returns completed result on success", async () => {
    const { generateMusic } = await import("@/lib/elevenlabs-music");
    (generateMusic as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: "completed",
      audioUrl: "data:audio/mpeg;base64,abc",
      duration: 15,
    });

    const { POST } = await import("@/app/api/music/submit/route");
    const res = await POST(jsonRequest({ userId: "test-user", prompt: "epic sports anthem" }));
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

  it("returns 400 when userId is missing", async () => {
    const { POST } = await import("@/app/api/intro/route");
    const res = await POST(jsonRequest({ prompt: "Epic intro card" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("userId");
  });

  it("returns 402 when quota is exceeded", async () => {
    const { checkExportAllowed } = await import("@/lib/entitlement");
    (checkExportAllowed as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false, isPro: false, remaining: 0, limit: 5, used: 5,
      reason: "free monthly limit reached",
    });
    const { POST } = await import("@/app/api/intro/route");
    const res = await POST(jsonRequest({ userId: "test-user", prompt: "Epic intro card" }));
    expect(res.status).toBe(402);
  });

  it("rejects an oversized prompt BEFORE the entitlement gate (H2 bounds-first)", async () => {
    // The prompt bound must fire ahead of checkExportAllowed so a hostile client cannot make us
    // burn an ES256 JWS verify + KV quota read on a multi-KB malformed prompt. A valid userId is
    // supplied so the userId gate passes and the oversized prompt is the only thing left to reject.
    const { checkExportAllowed } = await import("@/lib/entitlement");
    (checkExportAllowed as ReturnType<typeof vi.fn>).mockClear();
    const { POST } = await import("@/app/api/intro/route");
    const res = await POST(jsonRequest({ userId: "test-user", prompt: "x".repeat(1001) }));
    expect(res.status).toBe(400);
    expect(checkExportAllowed).not.toHaveBeenCalled();
  });

  it("returns prediction ID on success", async () => {
    const { submitTextToVideo } = await import("@/lib/atlascloud");
    (submitTextToVideo as ReturnType<typeof vi.fn>).mockResolvedValueOnce("pred_intro_123");

    const { POST } = await import("@/app/api/intro/route");
    const res = await POST(jsonRequest({ userId: "test-user", prompt: "Epic intro card", duration: 5 }));
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

  it("returns 400 when userId is missing", async () => {
    const { POST } = await import("@/app/api/thumbnail/route");
    const res = await POST(jsonRequest({ imageData: "data:image/jpeg;base64,abc" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("userId");
  });

  it("returns 402 when quota is exceeded", async () => {
    const { checkExportAllowed } = await import("@/lib/entitlement");
    (checkExportAllowed as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false, isPro: false, remaining: 0, limit: 5, used: 5,
      reason: "free monthly limit reached",
    });
    const { POST } = await import("@/app/api/thumbnail/route");
    const res = await POST(jsonRequest({ userId: "test-user", imageData: "data:image/jpeg;base64,abc" }));
    expect(res.status).toBe(402);
  });

  it("returns prediction ID on success", async () => {
    const { submitBackgroundRemoval } = await import("@/lib/atlascloud");
    (submitBackgroundRemoval as ReturnType<typeof vi.fn>).mockResolvedValueOnce("pred_thumb_456");

    const { POST } = await import("@/app/api/thumbnail/route");
    const res = await POST(jsonRequest({ userId: "test-user", imageData: "data:image/jpeg;base64,abc" }));
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

  it("returns 400 when userId is missing", async () => {
    const { POST } = await import("@/app/api/upscale/route");
    const res = await POST(jsonRequest({ imageData: "data:image/jpeg;base64,abc" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("userId");
  });

  it("returns 402 when quota is exceeded", async () => {
    const { checkExportAllowed } = await import("@/lib/entitlement");
    (checkExportAllowed as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false, isPro: false, remaining: 0, limit: 5, used: 5,
      reason: "free monthly limit reached",
    });
    const { POST } = await import("@/app/api/upscale/route");
    const res = await POST(jsonRequest({ userId: "test-user", imageData: "data:image/jpeg;base64,abc" }));
    expect(res.status).toBe(402);
  });

  it("returns prediction ID on success", async () => {
    const { submitImageUpscale } = await import("@/lib/atlascloud");
    (submitImageUpscale as ReturnType<typeof vi.fn>).mockResolvedValueOnce("pred_up_789");

    const { POST } = await import("@/app/api/upscale/route");
    const res = await POST(jsonRequest({ userId: "test-user", imageData: "data:image/jpeg;base64,abc" }));
    const data = await res.json();
    expect(data.predictionId).toBe("pred_up_789");
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

  it("returns 400 when userId is missing", async () => {
    const { POST } = await import("@/app/api/talking-head/route");
    const res = await POST(jsonRequest({
      imageData: "data:image/jpeg;base64,abc",
      audioData: "data:audio/mp3;base64,xyz",
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("userId");
  });

  it("returns 402 when quota is exceeded", async () => {
    const { checkExportAllowed } = await import("@/lib/entitlement");
    (checkExportAllowed as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false, isPro: false, remaining: 0, limit: 5, used: 5,
      reason: "free monthly limit reached",
    });
    const { POST } = await import("@/app/api/talking-head/route");
    const res = await POST(jsonRequest({
      userId: "test-user",
      imageData: "data:image/jpeg;base64,abc",
      audioData: "data:audio/mp3;base64,xyz",
    }));
    expect(res.status).toBe(402);
  });

  it("returns prediction ID on success", async () => {
    const { submitLipSync } = await import("@/lib/atlascloud");
    (submitLipSync as ReturnType<typeof vi.fn>).mockResolvedValueOnce("pred_th_202");

    const { POST } = await import("@/app/api/talking-head/route");
    const res = await POST(jsonRequest({
      userId: "test-user",
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
    const { __resetCeilingStoreForTests } = await import("@/lib/spend-ceiling");
    __resetCeilingStoreForTests(); // start under the global stems ceiling
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

  it("returns 429 once the GLOBAL daily stems ceiling is exhausted (anonymous wallet backstop)", async () => {
    const { __resetCeilingStoreForTests, enforceGlobalGenerationCeiling, GLOBAL_STEMS_DAILY_CAP } =
      await import("@/lib/spend-ceiling");
    __resetCeilingStoreForTests();
    // Fill the shared "stems" bucket to its cap via the same function the route calls.
    for (let i = 0; i < GLOBAL_STEMS_DAILY_CAP; i++) {
      await enforceGlobalGenerationCeiling("stems", GLOBAL_STEMS_DAILY_CAP);
    }

    const { isolateInstrumental } = await import("@/lib/elevenlabs-stems");
    const { POST } = await import("@/app/api/stems/route");
    const res = await POST(jsonRequest({ musicDataUri: "data:audio/mpeg;base64,abc" }));

    expect(res.status).toBe(429);
    // The paid provider call must NOT fire once the ceiling is hit.
    expect(isolateInstrumental as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    __resetCeilingStoreForTests(); // don't leak the exhausted counter to later tests
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
