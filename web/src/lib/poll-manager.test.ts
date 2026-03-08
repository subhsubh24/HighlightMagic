import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetch before importing the module
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import after mocking
import { pollBatched, cancelPoll, cancelAllPolls } from "./poll-manager";

describe("poll-manager", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.useFakeTimers();
    // Clean up any pending polls from previous tests
    cancelAllPolls();
  });

  afterEach(() => {
    cancelAllPolls();
    vi.useRealTimers();
  });

  describe("cancelPoll", () => {
    it("rejects the promise with cancellation error", async () => {
      const promise = pollBatched("pred_123", { timeoutMs: 60_000 });
      cancelPoll("pred_123");

      await expect(promise).rejects.toThrow("cancelled");
    });

    it("does nothing for unknown prediction IDs", () => {
      // Should not throw
      cancelPoll("nonexistent");
    });
  });

  describe("cancelAllPolls", () => {
    it("rejects all pending promises", async () => {
      const p1 = pollBatched("pred_1", { timeoutMs: 60_000 });
      const p2 = pollBatched("pred_2", { timeoutMs: 60_000 });

      cancelAllPolls();

      await expect(p1).rejects.toThrow("cancelled");
      await expect(p2).rejects.toThrow("cancelled");
    });
  });

  describe("pollBatched", () => {
    it("resolves when task completes", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "completed", videoUrl: "https://example.com/video.mp4" }),
      });

      const promise = pollBatched("pred_success", { timeoutMs: 60_000 });

      // Advance past first poll interval
      await vi.advanceTimersByTimeAsync(5_000);

      const result = await promise;
      expect(result).toBe("https://example.com/video.mp4");
    });

    it("rejects when task fails", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "failed", error: "Generation failed" }),
      });

      const promise = pollBatched("pred_fail", { timeoutMs: 60_000 });
      // Attach catch handler BEFORE advancing timers to prevent unhandled rejection
      const assertion = expect(promise).rejects.toThrow("Generation failed");
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
    });

    it("rejects on timeout", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "processing" }),
      });

      const promise = pollBatched("pred_timeout", { timeoutMs: 10_000 });
      // Attach catch handler BEFORE advancing timers
      const assertion = expect(promise).rejects.toThrow("timeout");
      await vi.advanceTimersByTimeAsync(15_000);
      await assertion;
    });

    it("rejects after too many consecutive errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const promise = pollBatched("pred_errors", { timeoutMs: 60_000, maxErrors: 3 });
      // Attach catch handler BEFORE advancing timers
      const assertion = expect(promise).rejects.toThrow("consecutive poll errors");

      await vi.advanceTimersByTimeAsync(5_000);
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
    });

    it("extends deadline for duplicate registrations", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "completed", videoUrl: "https://example.com/v.mp4" }),
      });

      const p1 = pollBatched("pred_dup", { timeoutMs: 10_000 });
      const p2 = pollBatched("pred_dup", { timeoutMs: 30_000 });

      await vi.advanceTimersByTimeAsync(5_000);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe("https://example.com/v.mp4");
      expect(r2).toBe("https://example.com/v.mp4");
    });
  });
});
