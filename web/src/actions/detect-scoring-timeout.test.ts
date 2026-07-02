import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scoreSingleBatch } from "./detect";

/**
 * Regression guard for the frame-scoring timeout (reliability): the Anthropic
 * vision call in analyzeMultiBatch previously had NO AbortSignal, so a stalled
 * upstream connection could hang the detection server action until the platform
 * opaquely killed the function. It must now be bounded — matching the sibling
 * /api/score route (45s under maxDuration 60), which makes the identical call.
 */
describe("scoreSingleBatch — upstream call is time-bounded", () => {
  const batch = [
    {
      sourceFileId: "s1",
      sourceFileName: "clip.mp4",
      sourceType: "video" as const,
      timestamp: 1.0,
      base64: "AAAA",
    },
  ];
  const sourceFiles = [{ id: "s1", name: "clip.mp4", type: "video" as const, frameCount: 10 }];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("passes an AbortSignal (timeout) to the scoring fetch", async () => {
    // A valid scoring response completes on the first fetch (no retry), so we can
    // inspect exactly one call's RequestInit for the bounding signal.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: '[{"index":0,"score":0.8,"label":"highlight"}]' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: "end_turn",
      }),
      text: async () => "",
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const scores = await scoreSingleBatch(batch, sourceFiles);
    expect(scores).toHaveLength(1);
    expect(scores[0].score).toBeCloseTo(0.8);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    // Before the fix this was undefined (unbounded call → potential opaque hang).
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("still throws a clear error (never hangs) when the key is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());

    await expect(scoreSingleBatch(batch, sourceFiles)).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
