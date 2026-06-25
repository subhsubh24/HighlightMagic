/**
 * Tests for the four API routes gated in PR #61:
 *   POST /api/outro
 *   POST /api/style-transfer
 *   POST /api/voice-clone
 *   POST /api/animate/submit
 *
 * Verifies: userId validation, entitlement gate (402), body validation, and
 * success response shape. External service calls are fully mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock external dependencies ──────────────────────────────────────────────

vi.mock("@/lib/atlascloud", () => ({
  submitTextToVideo: vi.fn(),
  submitStyleTransfer: vi.fn(),
  submitPhotoAnimation: vi.fn(),
  submitBackgroundRemoval: vi.fn(),
  submitImageUpscale: vi.fn(),
  submitLipSync: vi.fn(),
}));

vi.mock("@/lib/kling", () => ({
  submitPhotoAnimation: vi.fn(),
}));

vi.mock("@/lib/elevenlabs-voice-clone", () => ({
  createVoiceClone: vi.fn(),
}));

// Default: quota OK. Override per-test with mockResolvedValueOnce.
vi.mock("@/lib/entitlement", () => ({
  checkExportAllowed: vi.fn().mockResolvedValue({
    allowed: true, isPro: false, remaining: 4, limit: 5, used: 1,
  }),
  consumeExport: vi.fn().mockResolvedValue(2),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function formRequest(fields: Record<string, string | Blob>): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request("http://localhost/api/test", { method: "POST", body: fd });
}

// ── POST /api/outro ──────────────────────────────────────────────────────────

describe("POST /api/outro", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when userId is missing", async () => {
    const { POST } = await import("@/app/api/outro/route");
    const res = await POST(jsonRequest({ prompt: "sunset beach outro" }));
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
    const { POST } = await import("@/app/api/outro/route");
    const res = await POST(jsonRequest({ userId: "u1", prompt: "sunset outro" }));
    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.upgrade).toBe(true);
  });

  it("returns 400 when prompt is missing", async () => {
    const { POST } = await import("@/app/api/outro/route");
    const res = await POST(jsonRequest({ userId: "u1" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("prompt");
  });

  it("returns 400 when prompt exceeds 1000 characters", async () => {
    const { POST } = await import("@/app/api/outro/route");
    const res = await POST(jsonRequest({ userId: "u1", prompt: "x".repeat(1001) }));
    expect(res.status).toBe(400);
  });

  it("returns predictionId on success", async () => {
    const { submitTextToVideo } = await import("@/lib/atlascloud");
    (submitTextToVideo as ReturnType<typeof vi.fn>).mockResolvedValueOnce("pred-outro-001");
    const { POST } = await import("@/app/api/outro/route");
    const res = await POST(jsonRequest({ userId: "u1", prompt: "dramatic close" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.predictionId).toBe("pred-outro-001");
  });

  it("clamps duration to [2, 10] and defaults to 5 when invalid", async () => {
    const { submitTextToVideo } = await import("@/lib/atlascloud");
    (submitTextToVideo as ReturnType<typeof vi.fn>).mockResolvedValueOnce("pred-001");
    const { POST } = await import("@/app/api/outro/route");
    await POST(jsonRequest({ userId: "u1", prompt: "outro", duration: "invalid" }));
    expect(submitTextToVideo).toHaveBeenCalledWith(expect.any(String), 5);
  });
});

// ── POST /api/style-transfer ──────────────────────────────────────────────────

describe("POST /api/style-transfer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when userId is missing", async () => {
    const { POST } = await import("@/app/api/style-transfer/route");
    const res = await POST(jsonRequest({ videoData: "data:video/mp4;base64,AAAA", prompt: "anime" }));
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
    const { POST } = await import("@/app/api/style-transfer/route");
    const res = await POST(jsonRequest({ userId: "u1", videoData: "data:video/mp4;base64,AAAA", prompt: "anime" }));
    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.upgrade).toBe(true);
  });

  it("returns 400 when videoData is missing", async () => {
    const { POST } = await import("@/app/api/style-transfer/route");
    const res = await POST(jsonRequest({ userId: "u1", prompt: "anime" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("videoData");
  });

  it("returns 400 when prompt is missing", async () => {
    const { POST } = await import("@/app/api/style-transfer/route");
    const res = await POST(jsonRequest({ userId: "u1", videoData: "data:video/mp4;base64,AAAA" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("prompt");
  });

  it("returns predictionId on success and strips data URI prefix", async () => {
    const { submitStyleTransfer } = await import("@/lib/atlascloud");
    (submitStyleTransfer as ReturnType<typeof vi.fn>).mockResolvedValueOnce("pred-st-001");
    const { POST } = await import("@/app/api/style-transfer/route");
    const res = await POST(jsonRequest({ userId: "u1", videoData: "data:video/mp4;base64,RAWBASE64", prompt: "anime" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.predictionId).toBe("pred-st-001");
    // Should have stripped the data URI prefix before calling submitStyleTransfer
    expect(submitStyleTransfer).toHaveBeenCalledWith("RAWBASE64", "anime", expect.any(Number));
  });

  it("clamps strength to [0.1, 1.0] and defaults to 0.5 for invalid input", async () => {
    const { submitStyleTransfer } = await import("@/lib/atlascloud");
    (submitStyleTransfer as ReturnType<typeof vi.fn>).mockResolvedValueOnce("pred-001");
    const { POST } = await import("@/app/api/style-transfer/route");
    await POST(jsonRequest({ userId: "u1", videoData: "data:video/mp4;base64,AAA", prompt: "test", strength: "bad" }));
    expect(submitStyleTransfer).toHaveBeenCalledWith(expect.any(String), "test", 0.5);
  });
});

// ── POST /api/voice-clone ─────────────────────────────────────────────────────

describe("POST /api/voice-clone", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 413 when content-length exceeds 10MB", async () => {
    const { POST } = await import("@/app/api/voice-clone/route");
    const req = new Request("http://localhost/api/voice-clone", {
      method: "POST",
      headers: { "content-length": String(11 * 1024 * 1024) },
      body: new FormData(),
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it("returns 400 when userId is missing from form data", async () => {
    const { POST } = await import("@/app/api/voice-clone/route");
    const res = await POST(formRequest({ audio: new Blob(["fake-audio"], { type: "audio/mpeg" }) }));
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
    const { POST } = await import("@/app/api/voice-clone/route");
    const res = await POST(formRequest({
      userId: "u1",
      audio: new Blob(["fake-audio"], { type: "audio/mpeg" }),
    }));
    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.upgrade).toBe(true);
  });

  it("returns 400 when audio file is missing", async () => {
    const { POST } = await import("@/app/api/voice-clone/route");
    const res = await POST(formRequest({ userId: "u1" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("audio");
  });

  it("returns voiceId on success", async () => {
    const { createVoiceClone } = await import("@/lib/elevenlabs-voice-clone");
    (createVoiceClone as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ voiceId: "voice-abc-123" });
    const { POST } = await import("@/app/api/voice-clone/route");
    const res = await POST(formRequest({
      userId: "u1",
      audio: new Blob(["fake-audio"], { type: "audio/mpeg" }),
      name: "My Clone",
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.voiceId).toBe("voice-abc-123");
  });
});

// ── POST /api/animate/submit ──────────────────────────────────────────────────

describe("POST /api/animate/submit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 413 when content-length exceeds 20MB", async () => {
    const { POST } = await import("@/app/api/animate/submit/route");
    const req = new Request("http://localhost/api/animate/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", "content-length": String(21 * 1024 * 1024) },
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it("returns 400 when userId is missing", async () => {
    const { POST } = await import("@/app/api/animate/submit/route");
    const res = await POST(jsonRequest({ imageData: "data:image/jpeg;base64,AAAA", prompt: "zoom in" }));
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
    const { POST } = await import("@/app/api/animate/submit/route");
    const res = await POST(jsonRequest({ userId: "u1", imageData: "data:image/jpeg;base64,AAAA", prompt: "zoom" }));
    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.upgrade).toBe(true);
  });

  it("returns 400 when imageData is missing", async () => {
    const { POST } = await import("@/app/api/animate/submit/route");
    const res = await POST(jsonRequest({ userId: "u1", prompt: "zoom in" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("imageData");
  });

  it("returns 400 when prompt is missing", async () => {
    const { POST } = await import("@/app/api/animate/submit/route");
    const res = await POST(jsonRequest({ userId: "u1", imageData: "data:image/jpeg;base64,AAAA" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("prompt");
  });

  it("returns predictionId on success", async () => {
    const { submitPhotoAnimation } = await import("@/lib/kling");
    (submitPhotoAnimation as ReturnType<typeof vi.fn>).mockResolvedValueOnce("pred-anim-001");
    const { POST } = await import("@/app/api/animate/submit/route");
    const res = await POST(jsonRequest({ userId: "u1", imageData: "data:image/jpeg;base64,AAAA", prompt: "slow zoom" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.predictionId).toBe("pred-anim-001");
  });

  it("clamps duration to [2, 10] and defaults to 5 for non-finite input", async () => {
    const { submitPhotoAnimation } = await import("@/lib/kling");
    (submitPhotoAnimation as ReturnType<typeof vi.fn>).mockResolvedValueOnce("pred-001");
    const { POST } = await import("@/app/api/animate/submit/route");
    await POST(jsonRequest({ userId: "u1", imageData: "data:image/jpeg;base64,AAAA", prompt: "test", duration: 99 }));
    expect(submitPhotoAnimation).toHaveBeenCalledWith(expect.any(String), "test", 10);
  });
});
