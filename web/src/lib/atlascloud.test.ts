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

    it("submitPhotoAnimation clamps duration to 2-10", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "pred_clamp" } }),
      });

      const { submitPhotoAnimation } = await import("./atlascloud");
      await submitPhotoAnimation("base64img", "test", 99);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.duration).toBe(10);
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
});
