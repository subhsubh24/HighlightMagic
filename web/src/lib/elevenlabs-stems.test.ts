import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { separateStems, isolateInstrumental } from "./elevenlabs-stems";

/** Audio Response stand-in (audio-isolation returns the instrumental bytes). */
function audioResponse(bytes: number, ok = true, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: async () => new ArrayBuffer(bytes),
    text: async () => "",
  } as unknown as Response;
}

describe("separateStems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("posts multipart audio to the isolation endpoint and returns the instrumental in every stem slot", async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(24_000));
    vi.stubGlobal("fetch", fetchMock);

    const r = await separateStems(Buffer.from("fake-mp3-bytes"), "track.mp3");

    expect(r.status).toBe("completed");
    const dataUri = r.stems?.drums;
    expect(dataUri).toMatch(/^data:audio\/mpeg;base64,/);
    // The pipeline reuses the single isolated instrumental for drums/bass/other; vocals empty.
    expect(r.stems?.bass).toBe(dataUri);
    expect(r.stems?.other).toBe(dataUri);
    expect(r.stems?.vocals).toBe("");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/audio-isolation");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ "xi-api-key": "test-key" });
    // FormData body (not JSON) — the api key is a header, not a query param.
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  it("accepts a Blob input as well as a Buffer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(12_000));
    vi.stubGlobal("fetch", fetchMock);

    const r = await separateStems(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }));

    expect(r.status).toBe("completed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns failed (never throws) on a non-OK API response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(0, false, 500)));

    const r = await separateStems(Buffer.from("x"));

    expect(r.status).toBe("failed");
    expect(r.error).toContain("500");
    expect(r.stems).toBeUndefined();
  });

  it("returns failed on an empty (0-byte) isolation response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(0, true, 200)));

    const r = await separateStems(Buffer.from("x"));

    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/empty/i);
  });

  it("throws a clear, actionable error when the API key is missing", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());

    await expect(separateStems(Buffer.from("x"))).rejects.toThrow(/ELEVENLABS_API_KEY/);
  });
});

describe("isolateInstrumental", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects a malformed data URI before making any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const r = await isolateInstrumental("not-a-data-uri");

    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/invalid data uri/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("decodes the data URI and returns the isolated instrumental URL on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(24_000)));

    const inputUri = `data:audio/mpeg;base64,${Buffer.from("music").toString("base64")}`;
    const r = await isolateInstrumental(inputUri);

    expect(r.status).toBe("completed");
    expect(r.instrumentalUrl).toMatch(/^data:audio\/mpeg;base64,/);
  });

  it("propagates a failed separation as a failed isolation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(0, false, 429)));

    const inputUri = `data:audio/mpeg;base64,${Buffer.from("music").toString("base64")}`;
    const r = await isolateInstrumental(inputUri);

    expect(r.status).toBe("failed");
    expect(r.error).toContain("429");
    expect(r.instrumentalUrl).toBeUndefined();
  });
});
