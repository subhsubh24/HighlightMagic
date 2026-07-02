import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { transcribeAudio } from "./elevenlabs-scribe";

/** Build a fetch Response stand-in for the Scribe speech-to-text endpoint. */
function scribeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => "",
  } as unknown as Response;
}

const audio = Buffer.from("fake-audio-bytes");

describe("transcribeAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("groups words into segments, splitting on a pause > 1s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        scribeResponse({
          text: "hello world next clip",
          language_code: "en",
          words: [
            { text: "hello", start: 0.0, end: 0.4, confidence: 0.9 },
            { text: "world", start: 0.5, end: 0.9, confidence: 0.95 },
            // 1.6s gap (2.5 - 0.9) > 1.0 → new segment
            { text: "next", start: 2.5, end: 2.8, confidence: 0.8 },
            { text: "clip", start: 2.9, end: 3.2, confidence: 0.85 },
          ],
        }),
      ),
    );

    const r = await transcribeAudio(audio, "clip.mp3");

    expect(r.status).toBe("completed");
    expect(r.language).toBe("en");
    expect(r.segments).toHaveLength(2);
    expect(r.segments![0]).toMatchObject({ text: "hello world", start: 0.0, end: 0.9 });
    expect(r.segments![1]).toMatchObject({ text: "next clip", start: 2.5, end: 3.2 });
    expect(r.text).toBe("hello world next clip");
  });

  it("keeps words with sub-1s gaps in a single segment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        scribeResponse({
          words: [
            { text: "a", start: 0.0, end: 0.2 },
            { text: "b", start: 0.5, end: 0.7 }, // 0.3s gap ≤ 1.0
            { text: "c", start: 1.4, end: 1.6 }, // 0.7s gap ≤ 1.0
          ],
        }),
      ),
    );

    const r = await transcribeAudio(audio);

    expect(r.segments).toHaveLength(1);
    expect(r.segments![0].text).toBe("a b c");
  });

  it("defaults a missing word confidence to 1.0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        scribeResponse({ words: [{ text: "solo", start: 0, end: 0.5 }] }),
      ),
    );

    const r = await transcribeAudio(audio);

    expect(r.segments![0].words[0].confidence).toBe(1.0);
  });

  it("returns an empty segment list (and joined text) when the API returns no words", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(scribeResponse({ text: "kept as full text", words: [] })),
    );

    const r = await transcribeAudio(audio);

    expect(r.status).toBe("completed");
    expect(r.segments).toEqual([]);
    expect(r.text).toBe("kept as full text");
  });

  it("falls back to the joined segment text when data.text is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        scribeResponse({
          words: [
            { text: "one", start: 0, end: 0.3 },
            { text: "two", start: 0.4, end: 0.7 },
          ],
        }),
      ),
    );

    const r = await transcribeAudio(audio);

    expect(r.text).toBe("one two"); // reconstructed from segments, not undefined
    expect(r.language).toBeUndefined(); // language_code absent
  });

  it("returns a failed result (not a throw) on an API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(scribeResponse({}, false, 500)));

    const r = await transcribeAudio(audio);

    expect(r.status).toBe("failed");
    expect(r.error).toContain("500");
    expect(r.segments).toBeUndefined();
  });

  it("throws a clear configuration error when the API key is missing", async () => {
    vi.unstubAllEnvs();
    vi.stubGlobal("fetch", vi.fn());

    await expect(transcribeAudio(audio)).rejects.toThrow(/ELEVENLABS_API_KEY is not configured/);
  });
});
