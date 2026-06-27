import { describe, expect, it } from "vitest";
import { resolveVoiceId } from "./elevenlabs-tts";

describe("resolveVoiceId", () => {
  it("maps a known Claude voice character to its ElevenLabs voice id", () => {
    expect(resolveVoiceId("male-broadcaster-hype")).toBe("pNInz6obpgDQGcFmaJgB");
    expect(resolveVoiceId("female-narrator-warm")).toBe("EXAVITQu4vr4xnSDxMaL");
  });

  it("falls back to the default voice for an unknown character", () => {
    expect(resolveVoiceId("nonexistent-voice")).toBe("pNInz6obpgDQGcFmaJgB");
    expect(resolveVoiceId("")).toBe("pNInz6obpgDQGcFmaJgB");
  });
});
