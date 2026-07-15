/**
 * Track H3 (error hygiene) for /api/voice-clone — the provider-EXCEPTION (throw) path.
 *
 * The sibling `provider-exception-hygiene.test.ts` covers the throw path on the JSON-body paid
 * routes (voiceover, sfx, music, intro, outro). voice-clone is the one paid route it does NOT
 * reach — it takes a MULTIPART audio upload, so it needs its own multipart-shaped request. Its
 * `catch (err)` block logs the raw provider message server-side but must answer the client with a
 * GENERIC 500 that names no vendor and carries no upstream status code; a regression that
 * interpolated `err.message` would leak the provider identity + status. This is the throw path;
 * the resolve/guard paths (413/400/402/200) are already covered in `pr61-routes.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/entitlement", () => ({
  checkExportAllowed: vi.fn(async () => ({ allowed: true, isPro: true, remaining: 999, limit: 999 })),
}));
vi.mock("@/lib/spend-ceiling", () => ({ enforceGenerationCeiling: vi.fn(async () => null) }));
vi.mock("@/lib/elevenlabs-voice-clone", () => ({ createVoiceClone: vi.fn() }));

import { createVoiceClone } from "@/lib/elevenlabs-voice-clone";
import { POST as voiceClone } from "@/app/api/voice-clone/route";
import { _resetBuckets } from "@/lib/rate-limit";

const mockClone = vi.mocked(createVoiceClone);

function multipartReq(fields: Record<string, string>, audio: Blob): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append("audio", audio);
  return new Request("http://localhost/api/voice-clone", {
    method: "POST",
    headers: { "x-forwarded-for": "10.9.0.1" },
    body: fd,
  });
}

beforeEach(() => _resetBuckets());
afterEach(() => vi.clearAllMocks());

describe("/api/voice-clone — provider-throw error hygiene (H3)", () => {
  it("turns a thrown provider error into a generic 500 that hides the vendor + status", async () => {
    mockClone.mockRejectedValue(new Error("ElevenLabs voice-clone API error (429)"));
    const res = await voiceClone(
      multipartReq({ userId: "u1", name: "My Voice" }, new Blob([new Uint8Array(1024)], { type: "audio/mpeg" })),
    );
    expect(res.status).toBe(500);
    const serialized = JSON.stringify(await res.json());
    expect(serialized).not.toContain("ElevenLabs");
    expect(serialized).not.toContain("429");
  });
});
