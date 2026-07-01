/**
 * Track H7 — behavioral proof that the per-user daily generation ceiling actually BLOCKS.
 *
 * generation-ceiling-wiring.test.ts is a source-scan invariant: it proves every paid route
 * *references* enforceGenerationCeiling(). But a source scan cannot prove the route HONORS the
 * result. A regression like:
 *
 *     enforceGenerationCeiling(userId);        // called — wiring scan stays green
 *     const result = await generateSoundEffect(...);   // ...but the 429 is never returned
 *
 * would keep the wiring test green while silently re-opening the unbounded wallet-drain path the
 * ceiling exists to close. This suite closes that gap: with the ceiling mocked to a 429, each
 * representative route must (a) return 429 and (b) NEVER reach its paid provider call — proving
 * both the short-circuit AND the ordering (ceiling before the provider). It spans both provider
 * families (ElevenLabs + AtlasCloud) so a per-family ordering regression is caught.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all external providers so a leaked call is observable (and never real) ──
vi.mock("@/lib/elevenlabs-sfx", () => ({ generateSoundEffect: vi.fn() }));
vi.mock("@/lib/elevenlabs-tts", () => ({ generateVoiceover: vi.fn() }));
vi.mock("@/lib/atlascloud", () => ({
  submitTextToVideo: vi.fn(),
  submitPhotoAnimation: vi.fn(),
  submitBackgroundRemoval: vi.fn(),
  submitImageUpscale: vi.fn(),
  submitLipSync: vi.fn(),
}));
vi.mock("@/lib/sfx-library", () => ({
  // Default to a miss so the sfx route falls through to the quota gate + ceiling
  // (a library hit would short-circuit BEFORE the ceiling and mask the behavior we assert).
  lookupSfxLibrary: vi.fn(() => null),
  cacheSfxResult: vi.fn(),
}));
// Quota gate: always allow, so the ceiling is the only thing that can block.
vi.mock("@/lib/entitlement", () => ({
  checkExportAllowed: vi.fn().mockResolvedValue({
    allowed: true, isPro: false, remaining: 4, limit: 5, used: 1,
  }),
  consumeExport: vi.fn().mockResolvedValue(2),
}));
// The unit under test: mock ONLY enforceGenerationCeiling; keep every other spend-ceiling
// export real so the routes' recordDaily*/checkDailySpendCeiling imports still resolve.
vi.mock("@/lib/spend-ceiling", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/spend-ceiling")>();
  return { ...actual, enforceGenerationCeiling: vi.fn(() => null) };
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Force the ceiling to block on the next call, mirroring the real 429 the route sees. */
async function blockCeilingOnce() {
  const { enforceGenerationCeiling } = await import("@/lib/spend-ceiling");
  (enforceGenerationCeiling as ReturnType<typeof vi.fn>).mockReturnValueOnce(
    Response.json(
      { error: "Daily generation limit reached. Try again tomorrow." },
      { status: 429 },
    ),
  );
}

describe("generation ceiling blocks the paid provider call (H7 behavioral)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST /api/sfx → 429 and never calls generateSoundEffect", async () => {
    await blockCeilingOnce();
    const { generateSoundEffect } = await import("@/lib/elevenlabs-sfx");
    const { POST } = await import("@/app/api/sfx/route");

    const res = await POST(jsonRequest({ userId: "u1", prompt: "whoosh" }));

    expect(res.status).toBe(429);
    expect(generateSoundEffect).not.toHaveBeenCalled();
  });

  it("POST /api/voiceover → 429 and never calls generateVoiceover", async () => {
    await blockCeilingOnce();
    const { generateVoiceover } = await import("@/lib/elevenlabs-tts");
    const { POST } = await import("@/app/api/voiceover/route");

    const res = await POST(jsonRequest({ userId: "u1", text: "hello there" }));

    expect(res.status).toBe(429);
    expect(generateVoiceover).not.toHaveBeenCalled();
  });

  it("POST /api/intro → 429 and never calls submitTextToVideo", async () => {
    await blockCeilingOnce();
    const { submitTextToVideo } = await import("@/lib/atlascloud");
    const { POST } = await import("@/app/api/intro/route");

    const res = await POST(jsonRequest({ userId: "u1", prompt: "opening card" }));

    expect(res.status).toBe(429);
    expect(submitTextToVideo).not.toHaveBeenCalled();
  });

  it("POST /api/thumbnail → 429 and never calls submitBackgroundRemoval", async () => {
    await blockCeilingOnce();
    const { submitBackgroundRemoval } = await import("@/lib/atlascloud");
    const { POST } = await import("@/app/api/thumbnail/route");

    const res = await POST(jsonRequest({ userId: "u1", imageData: "data:image/png;base64,aaaa" }));

    expect(res.status).toBe(429);
    expect(submitBackgroundRemoval).not.toHaveBeenCalled();
  });

  it("allows the provider call through when the ceiling does NOT block (control)", async () => {
    // No blockCeilingOnce() — the default mock returns null (allowed), so sfx reaches the provider.
    const { generateSoundEffect } = await import("@/lib/elevenlabs-sfx");
    (generateSoundEffect as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: "completed", audioUrl: "data:audio/mpeg;base64,ok", duration: 2,
    });
    const { POST } = await import("@/app/api/sfx/route");

    const res = await POST(jsonRequest({ userId: "u1", prompt: "whoosh" }));

    expect(res.status).toBe(200);
    expect(generateSoundEffect).toHaveBeenCalledTimes(1);
  });
});
