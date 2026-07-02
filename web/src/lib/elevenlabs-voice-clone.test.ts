import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createVoiceClone,
  deleteVoiceClone,
  generateWithClonedVoice,
} from "./elevenlabs-voice-clone";

/** JSON Response stand-in (voices/add returns a voice_id envelope). */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

/** Audio Response stand-in (TTS returns MP3 bytes). */
function audioResponse(bytes: number, ok = true, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: async () => new ArrayBuffer(bytes),
    text: async () => "",
  } as unknown as Response;
}

describe("createVoiceClone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("posts multipart audio to voices/add and returns the created voice ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ voice_id: "vc_123" }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await createVoiceClone(Buffer.from("sample"), "Coach", "coach.mp3");

    expect(r.status).toBe("completed");
    expect(r.voiceId).toBe("vc_123");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/voices/add");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ "xi-api-key": "test-key" });
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  it("returns failed when the API responds OK but omits a voice_id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    const r = await createVoiceClone(Buffer.from("sample"));

    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/no voice id/i);
  });

  it("returns failed (never throws) on a non-OK API response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "quota" }, false, 401)));

    const r = await createVoiceClone(Buffer.from("sample"));

    expect(r.status).toBe("failed");
    expect(r.error).toContain("401");
  });

  it("throws a clear, actionable error when the API key is missing", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());

    await expect(createVoiceClone(Buffer.from("x"))).rejects.toThrow(/ELEVENLABS_API_KEY/);
  });
});

describe("deleteVoiceClone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("issues a DELETE to the voice endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, true, 200));
    vi.stubGlobal("fetch", fetchMock);

    await deleteVoiceClone("vc_123");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/voices/vc_123");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("swallows network errors during cleanup (never throws — best-effort)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    // Cleanup must not surface an error that would mask the export result.
    await expect(deleteVoiceClone("vc_123")).resolves.toBeUndefined();
  });
});

describe("generateWithClonedVoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("posts to the TTS endpoint for the cloned voice and returns audio + duration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(32_000));
    vi.stubGlobal("fetch", fetchMock);

    const r = await generateWithClonedVoice("Great goal!", "vc_123");

    expect(r.status).toBe("completed");
    expect(r.audioUrl).toMatch(/^data:audio\/mpeg;base64,/);
    expect(r.duration).toBe(2); // 32000 / 16000
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/text-to-speech/vc_123");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model_id).toBe("eleven_flash_v2_5");
    expect(body.text).toBe("Great goal!");
  });

  it("returns failed (never throws) with the status in the message on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(0, false, 422)));

    const r = await generateWithClonedVoice("hi", "vc_123");

    expect(r.status).toBe("failed");
    expect(r.error).toContain("422");
  });

  it("returns failed on an empty (0-byte) audio buffer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(0, true, 200)));

    const r = await generateWithClonedVoice("hi", "vc_123");

    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/empty/i);
  });
});
