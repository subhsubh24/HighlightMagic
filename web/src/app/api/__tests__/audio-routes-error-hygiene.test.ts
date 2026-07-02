/**
 * Track H3 (error hygiene) — the paid audio routes (voiceover, sfx, music/submit) must NOT
 * relay the provider's raw failure text to the client. That text names the vendor
 * ("ElevenLabs …") and carries the upstream HTTP status code, which lets an attacker
 * enumerate the provider and probe its rate-limit / health state without authorization.
 *
 * Each route is driven past the rate-limit + quota + spend-ceiling gates (all mocked to
 * allow) so we reach the provider call, which is mocked to fail with a vendor-identifying
 * error. The route must answer 502 with a GENERIC message and leak none of the raw text.
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

import { generateVoiceover } from "@/lib/elevenlabs-tts";
import { generateSoundEffect } from "@/lib/elevenlabs-sfx";
import { generateMusic } from "@/lib/elevenlabs-music";
import { POST as voiceover } from "@/app/api/voiceover/route";
import { POST as sfx } from "@/app/api/sfx/route";
import { POST as musicSubmit } from "@/app/api/music/submit/route";
import { _resetBuckets } from "@/lib/rate-limit";

const mockVoiceover = vi.mocked(generateVoiceover);
const mockSfx = vi.mocked(generateSoundEffect);
const mockMusic = vi.mocked(generateMusic);

// The raw provider failure the client must never see.
const LEAK = "ElevenLabs TTS API error (429)";

function req(body: unknown, ip: string): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function assertNoLeak(body: { error?: string }, generic: string) {
  expect(body.error).toBe(generic);
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain("ElevenLabs");
  expect(serialized).not.toContain("429");
}

beforeEach(() => _resetBuckets());
afterEach(() => vi.clearAllMocks());

describe("H3 error hygiene on the paid audio routes", () => {
  it("voiceover returns a generic 502 and hides the provider error", async () => {
    mockVoiceover.mockResolvedValue({ status: "failed", error: LEAK });
    const res = await voiceover(req({ userId: "u1", text: "hello there" }, "10.1.0.1"));
    expect(res.status).toBe(502);
    assertNoLeak(await res.json(), "Voiceover generation failed");
  });

  it("sfx returns a generic 502 and hides the provider error", async () => {
    mockSfx.mockResolvedValue({ status: "failed", error: "ElevenLabs SFX API error (429)" });
    const res = await sfx(req({ userId: "u1", prompt: "zzz-nonexistent-sfx-prompt" }, "10.1.0.2"));
    expect(res.status).toBe(502);
    assertNoLeak(await res.json(), "SFX generation failed");
  });

  it("music/submit returns a generic 502 and hides the provider error", async () => {
    mockMusic.mockResolvedValue({ status: "failed", error: "ElevenLabs API error (503)" });
    const res = await musicSubmit(req({ userId: "u1", prompt: "lofi beat", durationMs: 30000 }, "10.1.0.3"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Music generation failed");
    expect(JSON.stringify(body)).not.toContain("ElevenLabs");
    expect(JSON.stringify(body)).not.toContain("503");
  });
});
