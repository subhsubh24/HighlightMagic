/**
 * Track H3 (error hygiene) — the provider-EXCEPTION path.
 *
 * `audio-routes-error-hygiene.test.ts` covers the case where the provider RESOLVES with a
 * `{ status: "failed", error: "<vendor text>" }` object. This file covers the orthogonal case
 * where the provider client THROWS (SDK timeout, network reject, JSON parse error) — a distinct
 * code path handled by each route's `catch (err)` block, not the `status === "failed"` branch.
 *
 * That catch block logs the raw message server-side but must answer the client with a GENERIC
 * 500 that names no vendor and carries no upstream status code. A regression that re-threw the
 * error, or interpolated `err.message` into the response, would leak the provider identity and
 * let an attacker enumerate it / probe its health — so each throw path needs its own guard.
 *
 * Each route is driven past the rate-limit + quota + spend-ceiling gates (all mocked to allow)
 * so we reach the provider call, which is mocked to REJECT with a vendor-identifying error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/entitlement", () => ({
  checkExportAllowed: vi.fn(async () => ({
    allowed: true,
    isPro: false,
    remaining: 4,
    limit: 5,
    used: 1,
  })),
}));
vi.mock("@/lib/spend-ceiling", () => ({ enforceGenerationCeiling: vi.fn(async () => null) }));
// The sfx route consults a local library before the paid call — force a miss so we reach it.
vi.mock("@/lib/sfx-library", () => ({
  lookupSfxLibrary: vi.fn(() => null),
  cacheSfxResult: vi.fn(),
}));
vi.mock("@/lib/elevenlabs-tts", () => ({ generateVoiceover: vi.fn() }));
vi.mock("@/lib/elevenlabs-sfx", () => ({ generateSoundEffect: vi.fn() }));
vi.mock("@/lib/elevenlabs-music", () => ({ generateMusic: vi.fn() }));
vi.mock("@/lib/atlascloud", () => ({ submitTextToVideo: vi.fn() }));

import { generateVoiceover } from "@/lib/elevenlabs-tts";
import { generateSoundEffect } from "@/lib/elevenlabs-sfx";
import { generateMusic } from "@/lib/elevenlabs-music";
import { submitTextToVideo } from "@/lib/atlascloud";
import { POST as voiceover } from "@/app/api/voiceover/route";
import { POST as sfx } from "@/app/api/sfx/route";
import { POST as musicSubmit } from "@/app/api/music/submit/route";
import { POST as intro } from "@/app/api/intro/route";
import { POST as outro } from "@/app/api/outro/route";
import { _resetBuckets } from "@/lib/rate-limit";

const mockVoiceover = vi.mocked(generateVoiceover);
const mockSfx = vi.mocked(generateSoundEffect);
const mockMusic = vi.mocked(generateMusic);
const mockTextToVideo = vi.mocked(submitTextToVideo);

// Vendor-identifying text the client must never see in a thrown-error response.
const ELEVENLABS_LEAK = "ElevenLabs TTS API error (429)";
const ATLAS_LEAK = "AtlasCloud submit failed: 503 upstream";

function req(body: unknown, ip: string): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function assertGenericNoLeak(status: number, body: { error?: string }, generic: string, ...secrets: string[]) {
  expect(status).toBe(500);
  expect(body.error).toBe(generic);
  const serialized = JSON.stringify(body);
  for (const secret of secrets) expect(serialized).not.toContain(secret);
}

beforeEach(() => _resetBuckets());
afterEach(() => vi.clearAllMocks());

describe("H3 error hygiene — the provider-EXCEPTION (throw) path", () => {
  it("voiceover: a thrown TTS error becomes a generic 500, hiding the vendor", async () => {
    mockVoiceover.mockRejectedValue(new Error(ELEVENLABS_LEAK));
    const res = await voiceover(req({ userId: "u1", text: "hello there", voiceCharacter: "warm" }, "10.2.0.1"));
    assertGenericNoLeak(res.status, await res.json(), "Voiceover generation failed", "ElevenLabs", "429");
  });

  it("sfx: a thrown SFX error becomes a generic 500, hiding the vendor", async () => {
    mockSfx.mockRejectedValue(new Error(ELEVENLABS_LEAK));
    const res = await sfx(req({ userId: "u1", prompt: "whoosh", durationMs: 2000 }, "10.2.0.2"));
    assertGenericNoLeak(res.status, await res.json(), "SFX generation failed", "ElevenLabs", "429");
  });

  it("music/submit: a thrown music error becomes a generic 500, hiding the vendor", async () => {
    mockMusic.mockRejectedValue(new Error(ELEVENLABS_LEAK));
    const res = await musicSubmit(req({ userId: "u1", prompt: "lofi beat", durationMs: 30000 }, "10.2.0.3"));
    assertGenericNoLeak(res.status, await res.json(), "Music generation failed", "ElevenLabs", "429");
  });

  it("intro: a thrown Text-to-Video error becomes a generic 500, hiding the vendor", async () => {
    mockTextToVideo.mockRejectedValue(new Error(ATLAS_LEAK));
    const res = await intro(req({ userId: "u1", prompt: "Sunset road trip", duration: 5 }, "10.2.0.4"));
    assertGenericNoLeak(res.status, await res.json(), "Intro card generation failed", "AtlasCloud", "503");
  });

  it("outro: a thrown Text-to-Video error becomes a generic 500, hiding the vendor", async () => {
    mockTextToVideo.mockRejectedValue(new Error(ATLAS_LEAK));
    const res = await outro(req({ userId: "u1", prompt: "Thanks for watching", duration: 5 }, "10.2.0.5"));
    assertGenericNoLeak(res.status, await res.json(), "Outro card generation failed", "AtlasCloud", "503");
  });
});
