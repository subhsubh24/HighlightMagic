import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { planFromScores } from "./detect";

/**
 * Regression guard for the planner-fetch timeout (reliability, B6). The streaming Anthropic planner
 * call in planHighlightTape previously passed NO timeoutMs to fetchWithRetry, so the fetch had no
 * AbortSignal — a stalled upstream connection could hang detection until the platform opaquely killed
 * the function at maxDuration (300s). consumeSSEStream's per-chunk stall timeout only fires AFTER
 * headers return, so the initial connect was unbounded. The call must now be time-bounded, matching
 * its siblings (scoring 45s<60, tape-validation 30s<60).
 */
describe("planFromScores — planner upstream call is time-bounded", () => {
  const frames = [
    {
      sourceFileId: "s1",
      sourceFileName: "clip.mp4",
      sourceType: "video" as const,
      timestamp: 1.0,
      base64: "AAAA",
    },
  ];
  const scores = [
    {
      sourceFileId: "s1",
      sourceType: "video" as const,
      timestamp: 1.0,
      score: 0.8,
      label: "highlight",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("passes an AbortSignal (timeout) to the planner fetch", async () => {
    // Return a non-ok 500 so planHighlightTape throws immediately AFTER the fetch — we only need to
    // inspect that the planner request carried a bounding AbortSignal (before the fix it was
    // undefined → an unbounded call that could hang until the platform kill). A 500 is non-retryable
    // in fetchWithRetry, so the planner endpoint is hit exactly once.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "upstream boom",
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(planFromScores(frames, scores)).rejects.toThrow();

    const plannerCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/v1/messages"),
    );
    expect(plannerCall).toBeDefined();
    const init = plannerCall![1] as RequestInit;
    // Before the fix this was undefined (unbounded call → potential opaque hang).
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("still throws a clear error (never hangs) when the key is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());

    await expect(planFromScores(frames, scores)).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
