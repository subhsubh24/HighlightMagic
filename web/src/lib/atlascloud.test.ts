import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally before importing module
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock env
vi.stubEnv("ATLASCLOUD_API_KEY", "test-atlas-key-123");

describe("Atlas Cloud API", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("submitTask", () => {
    it("sends correct headers and payload for video generation", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "pred_123" } }),
      });

      const { submitTask, MODELS } = await import("./atlascloud");
      const result = await submitTask(MODELS.KLING_I2V, {
        image: "base64data",
        prompt: "animate this",
        duration: 5,
      });

      expect(result).toBe("pred_123");
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("/generateVideo");
      expect(opts.method).toBe("POST");
      expect(opts.headers["Authorization"]).toBe("Bearer test-atlas-key-123");
      expect(opts.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(opts.body);
      expect(body.model).toBe(MODELS.KLING_I2V);
      expect(body.image).toBe("base64data");
      expect(body.prompt).toBe("animate this");
    });

    it("sends to generateImage endpoint for image models", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "pred_456" } }),
      });

      const { submitTask, MODELS } = await import("./atlascloud");
      const result = await submitTask(
        MODELS.IMAGE_UPSCALER,
        { image: "base64data" },
        "generateImage"
      );

      expect(result).toBe("pred_456");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/generateImage");
    });

    it("throws on missing prediction ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      });

      const { submitTask, MODELS } = await import("./atlascloud");
      await expect(
        submitTask(MODELS.KLING_I2V, { image: "test" })
      ).rejects.toThrow("no prediction ID");
    });

    it("retries a THROWN submit fetch (network/DNS/timeout) instead of aborting the export", async () => {
      vi.useFakeTimers();
      // First submit throws like a socket/DNS blip or the AbortSignal.timeout firing; the retry
      // succeeds. Before the fix a thrown submit fetch propagated straight out with no retry —
      // the poll path already retried (#238), the submit path did not.
      mockFetch
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { id: "pred_retry" } }),
        });

      const { submitTask, MODELS } = await import("./atlascloud");
      const p = submitTask(MODELS.KLING_I2V, { image: "test" });
      await vi.runAllTimersAsync(); // let the backoff sleep elapse
      const result = await p;

      expect(result).toBe("pred_retry");
      expect(mockFetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("gives up (rejects) only after exhausting retries when the submit fetch keeps throwing", async () => {
      vi.useFakeTimers();
      mockFetch.mockRejectedValue(new Error("dns fail"));

      const { submitTask, MODELS } = await import("./atlascloud");
      const p = submitTask(MODELS.KLING_I2V, { image: "test" });
      const rejection = expect(p).rejects.toThrow("dns fail");
      await vi.runAllTimersAsync();
      await rejection;

      // Initial attempt + MAX_RETRIES(3) = 4 total before giving up (within the 55s budget).
      expect(mockFetch).toHaveBeenCalledTimes(4);
      vi.useRealTimers();
    });

    it("retries a 200 with an unparseable body (CDN/proxy corruption) instead of aborting", async () => {
      vi.useFakeTimers();
      // A 200 whose body cannot be parsed is transient like a thrown fetch — before the fix the
      // parse threw straight out of the loop with no retry.
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.reject(new SyntaxError("Unexpected end of JSON")) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: "pred_parsed" } }) });

      const { submitTask, MODELS } = await import("./atlascloud");
      const p = submitTask(MODELS.KLING_I2V, { image: "test" });
      await vi.runAllTimersAsync();
      const result = await p;

      expect(result).toBe("pred_parsed");
      expect(mockFetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });

  describe("submitAttemptTimeoutMs (B6 budget invariant)", () => {
    it("caps a fresh attempt at the per-attempt timeout", async () => {
      const { submitAttemptTimeoutMs } = await import("./atlascloud");
      // At elapsed=0 the per-attempt cap (50s) binds, not the 55s overall budget.
      expect(submitAttemptTimeoutMs(0)).toBe(50_000);
    });

    it("shrinks the attempt timeout as the overall budget is consumed", async () => {
      const { submitAttemptTimeoutMs } = await import("./atlascloud");
      // 6s in: 55s budget - 6s elapsed = 49s remaining, under the 50s per-attempt cap.
      expect(submitAttemptTimeoutMs(6_000)).toBe(49_000);
      // 54s in: only 1s of budget left.
      expect(submitAttemptTimeoutMs(54_000)).toBe(1_000);
    });

    it("keeps every firing attempt's deadline under the 60s route maxDuration", async () => {
      const { submitAttemptTimeoutMs } = await import("./atlascloud");
      for (const elapsed of [0, 1_000, 25_000, 49_000, 54_000, 60_000]) {
        const timeout = submitAttemptTimeoutMs(elapsed);
        // Once the budget is spent the helper returns 0 and the caller stops without
        // firing — so the only attempts that run finish comfortably before the 60s kill.
        if (timeout > 0) {
          expect(elapsed + timeout).toBeLessThanOrEqual(55_000); // SUBMIT_OVERALL_BUDGET_MS
          expect(elapsed + timeout).toBeLessThan(60_000);
        }
      }
    });

    it("returns 0 (caller must stop) once the budget is spent", async () => {
      const { submitAttemptTimeoutMs } = await import("./atlascloud");
      expect(submitAttemptTimeoutMs(55_000)).toBe(0);
      expect(submitAttemptTimeoutMs(99_000)).toBe(0);
    });
  });

  describe("checkTaskResult", () => {
    it("returns completed with output URL on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 200,
            message: "ok",
            data: {
              id: "pred_123",
              status: "succeeded",
              outputs: ["https://cdn.example.com/output.mp4"],
            },
          }),
      });

      const { checkTaskResult } = await import("./atlascloud");
      const result = await checkTaskResult("pred_123");

      expect(result.status).toBe("completed");
      expect(result.outputUrl).toBe("https://cdn.example.com/output.mp4");
    });

    it("returns processing for in-progress tasks", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 200,
            message: "ok",
            data: { id: "pred_123", status: "processing" },
          }),
      });

      const { checkTaskResult } = await import("./atlascloud");
      const result = await checkTaskResult("pred_123");

      expect(result.status).toBe("processing");
      expect(result.outputUrl).toBeUndefined();
    });

    it("returns failed with error message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 200,
            message: "ok",
            data: {
              id: "pred_123",
              status: "failed",
              error: "Content policy violation",
            },
          }),
      });

      const { checkTaskResult } = await import("./atlascloud");
      const result = await checkTaskResult("pred_123");

      expect(result.status).toBe("failed");
      expect(result.error).toBe("Content policy violation");
    });

    it("retries a THROWN fetch (network/DNS/timeout) instead of aborting the poll", async () => {
      vi.useFakeTimers();
      // First poll throws like a socket/DNS blip or the AbortSignal.timeout firing; the retry
      // succeeds. Before the fix this threw straight out and killed the whole export.
      mockFetch
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              message: "ok",
              data: { id: "pred_r", status: "succeeded", outputs: ["https://cdn.example.com/r.mp4"] },
            }),
        });

      const { checkTaskResult } = await import("./atlascloud");
      const p = checkTaskResult("pred_r");
      await vi.runAllTimersAsync(); // let the backoff sleep elapse
      const result = await p;

      expect(result.status).toBe("completed");
      expect(result.outputUrl).toBe("https://cdn.example.com/r.mp4");
      expect(mockFetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("gives up (rejects) only after exhausting retries when the fetch keeps throwing", async () => {
      vi.useFakeTimers();
      mockFetch.mockRejectedValue(new Error("dns fail"));

      const { checkTaskResult } = await import("./atlascloud");
      const p = checkTaskResult("pred_f");
      const rejection = expect(p).rejects.toThrow("dns fail");
      await vi.runAllTimersAsync();
      await rejection;

      // Initial attempt + MAX_RETRIES(3) = 4 total before giving up.
      expect(mockFetch).toHaveBeenCalledTimes(4);
      vi.useRealTimers();
    });

    it("retries a poll 200 with an unparseable body, then returns the parsed result", async () => {
      vi.useFakeTimers();
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.reject(new SyntaxError("truncated")) })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              message: "ok",
              data: { id: "pred_p", status: "succeeded", outputs: ["https://cdn.example.com/p.mp4"] },
            }),
        });

      const { checkTaskResult } = await import("./atlascloud");
      const p = checkTaskResult("pred_p");
      await vi.runAllTimersAsync();
      const result = await p;

      expect(result.status).toBe("completed");
      expect(result.outputUrl).toBe("https://cdn.example.com/p.mp4");
      expect(mockFetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("retries a transient 5xx poll response (502/503/504), then returns the parsed result", async () => {
      vi.useFakeTimers();
      // A 502/503/504 from the poll endpoint is a transient upstream/gateway blip — exactly like a
      // thrown fetch — so it must retry rather than abort the whole export. Before the retry branch
      // (atlascloud.ts:273-280) a single gateway hiccup killed every in-flight animation/upscale export.
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503, text: () => Promise.resolve("upstream unavailable") })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              message: "ok",
              data: { id: "pred_5xx", status: "succeeded", outputs: ["https://cdn.example.com/5xx.mp4"] },
            }),
        });

      const { checkTaskResult } = await import("./atlascloud");
      const p = checkTaskResult("pred_5xx");
      await vi.runAllTimersAsync();
      const result = await p;

      expect(result.status).toBe("completed");
      expect(result.outputUrl).toBe("https://cdn.example.com/5xx.mp4");
      expect(mockFetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("gives up (rejects) only after exhausting retries when the poll keeps returning 5xx", async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue({ ok: false, status: 504, text: () => Promise.resolve("gateway timeout") });

      const { checkTaskResult } = await import("./atlascloud");
      const p = checkTaskResult("pred_5xx_dead");
      const rejection = expect(p).rejects.toThrow("Atlas Cloud poll error (504)");
      await vi.runAllTimersAsync();
      await rejection;

      // Initial attempt + MAX_RETRIES(3) = 4 total before giving up.
      expect(mockFetch).toHaveBeenCalledTimes(4);
      vi.useRealTimers();
    });

    it("does NOT retry a non-transient 4xx poll response — throws immediately", async () => {
      // A 400/401/etc is a permanent error (bad request/auth), NOT a transient blip: retrying would
      // burn the poll budget re-hitting a call that fails identically. It must throw on the first hit.
      mockFetch.mockResolvedValue({ ok: false, status: 400, text: () => Promise.resolve("bad prediction id") });

      const { checkTaskResult } = await import("./atlascloud");
      await expect(checkTaskResult("pred_bad")).rejects.toThrow("Atlas Cloud poll error (400)");
      // No retry — exactly one fetch (contrast the 5xx exhaustion case above, which fetches 4×).
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("MODELS", () => {
    it("contains all expected model IDs", async () => {
      const { MODELS } = await import("./atlascloud");
      expect(MODELS.KLING_I2V).toContain("kling");
      expect(MODELS.WAN_T2V).toContain("wan-2.6");
      expect(MODELS.IMAGE_UPSCALER).toContain("upscaler");
      expect(MODELS.BG_REMOVER).toContain("background-remover");
      expect(MODELS.WAN_LIPSYNC).toContain("lip-sync");
      expect(MODELS.WAN_V2V).toContain("video-to-video");
    });
  });

  describe("convenience functions", () => {
    it("submitPhotoAnimation strips data URI prefix", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "pred_photo" } }),
      });

      const { submitPhotoAnimation } = await import("./atlascloud");
      await submitPhotoAnimation(
        "data:image/jpeg;base64,/9j/4AAQ",
        "a person walking",
        5
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.image).toBe("/9j/4AAQ"); // prefix stripped
      expect(body.prompt).toBe("a person walking");
      expect(body.duration).toBe(5);
    });

    // Kling accepts ONLY discrete durations (5 or 10). The provider rejects anything else with
    // "duration value 'N' is invalid" — so the submit layer must SNAP to the nearest valid value,
    // never pass an in-range-but-invalid duration (e.g. 2, 3) through. Regression for that bug.
    it.each([
      [2, 5], // the actual live-eval failure: 2 is invalid → must snap to 5, not pass through
      [3, 5],
      [4, 5],
      [7, 5],
      [8, 10],
      [99, 10], // above the max → nearest valid is 10
    ])("submitPhotoAnimation snaps duration %d → valid Kling %d", async (input, expected) => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "pred_snap" } }),
      });

      const { submitPhotoAnimation } = await import("./atlascloud");
      await submitPhotoAnimation("base64img", "test", input);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.duration).toBe(expected);
      expect([5, 10]).toContain(body.duration); // never an invalid value reaches Kling
    });

    it("submitTextToVideo sends correct model", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "pred_t2v" } }),
      });

      const { submitTextToVideo, MODELS } = await import("./atlascloud");
      await submitTextToVideo("a basketball game", 5);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe(MODELS.WAN_T2V);
      expect(body.prompt).toBe("a basketball game");
    });

    it("submitImageUpscale uses generateImage endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "pred_up" } }),
      });

      const { submitImageUpscale } = await import("./atlascloud");
      await submitImageUpscale("data:image/png;base64,abc123");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/generateImage");
    });

    it("submitBackgroundRemoval uses generateImage endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "pred_bg" } }),
      });

      const { submitBackgroundRemoval } = await import("./atlascloud");
      await submitBackgroundRemoval("base64img");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/generateImage");
    });

    it("submitLipSync includes image and audio", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "pred_lip" } }),
      });

      const { submitLipSync } = await import("./atlascloud");
      await submitLipSync(
        "data:image/jpeg;base64,imgdata",
        "data:audio/mpeg;base64,audiodata",
        5
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.image).toBe("imgdata");
      expect(body.audio).toBe("audiodata");
    });

    it("submitStyleTransfer clamps strength", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "pred_style" } }),
      });

      const { submitStyleTransfer } = await import("./atlascloud");
      await submitStyleTransfer("https://example.com/video.mp4", "anime style", 2.0);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.strength).toBe(1.0); // clamped from 2.0
    });
  });

  // pollTaskResult is the outer polling loop that every animate/upscale/style-transfer export
  // depends on: it loops checkTaskResult until the task completes, fails, or the deadline passes.
  // checkTaskResult itself is covered above; these exercise the loop's terminal outcomes.
  describe("pollTaskResult", () => {
    it("resolves with the output URL once the task completes", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 200,
            message: "ok",
            data: { id: "pred_ok", status: "succeeded", outputs: ["https://cdn.example.com/done.mp4"] },
          }),
      });

      const { pollTaskResult } = await import("./atlascloud");
      // Completes on the first poll → no interval sleep is reached, so no fake timers needed.
      await expect(pollTaskResult("pred_ok")).resolves.toBe("https://cdn.example.com/done.mp4");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("rejects when the task reports failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 200,
            message: "ok",
            data: { id: "pred_bad", status: "failed", error: "Content policy violation" },
          }),
      });

      const { pollTaskResult } = await import("./atlascloud");
      await expect(pollTaskResult("pred_bad")).rejects.toThrow("Task failed: Content policy violation");
    });

    it("rejects when a 'succeeded' task returns no output URL (never returns undefined)", async () => {
      // Provider-contract guard: a 'succeeded' status with empty outputs must NEVER surface as a
      // resolved-but-undefined URL to the export caller. checkTaskResult maps this to a failed
      // result, so pollTaskResult takes its failed branch and throws — this asserts the end-to-end
      // guarantee (the loop never returns an empty URL), whichever layer catches it.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 200,
            message: "ok",
            data: { id: "pred_empty", status: "succeeded", outputs: [] },
          }),
      });

      const { pollTaskResult } = await import("./atlascloud");
      await expect(pollTaskResult("pred_empty")).rejects.toThrow("no output URL returned");
    });

    it("keeps polling through 'processing' and resolves once complete", async () => {
      vi.useFakeTimers();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              message: "ok",
              data: { id: "pred_p", status: "processing" },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 200,
              message: "ok",
              data: { id: "pred_p", status: "succeeded", outputs: ["https://cdn.example.com/p.mp4"] },
            }),
        });

      const { pollTaskResult } = await import("./atlascloud");
      const p = pollTaskResult("pred_p");
      await vi.runAllTimersAsync(); // let the inter-poll interval sleep elapse and re-poll
      await expect(p).resolves.toBe("https://cdn.example.com/p.mp4");
      expect(mockFetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });
});
