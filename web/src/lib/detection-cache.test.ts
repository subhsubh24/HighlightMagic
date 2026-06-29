import { describe, it, expect, beforeEach } from "vitest";
import { cacheDetectionData, getCachedDetectionData, clearDetectionCache } from "./detection-cache";

beforeEach(() => {
  clearDetectionCache();
});

describe("detection-cache", () => {
  it("returns null when empty", () => {
    const { frames, scores } = getCachedDetectionData();
    expect(frames).toBeNull();
    expect(scores).toBeNull();
  });

  it("stores and retrieves frames and scores", () => {
    const mockFrames = [{ dataUrl: "data:image/jpeg;base64,abc", timestamp: 1, sourceFileId: "f1" }];
    const mockScores = [{ index: 0, score: 0.8, label: "test", timestamp: 1, narrativeRole: null }];

    cacheDetectionData(mockFrames as never, mockScores as never);

    const { frames, scores } = getCachedDetectionData();
    expect(frames).toHaveLength(1);
    expect(scores).toHaveLength(1);
    expect(frames![0].timestamp).toBe(1);
    expect(scores![0].score).toBe(0.8);
  });

  it("clears cached data", () => {
    cacheDetectionData([{} as never], [{} as never]);
    clearDetectionCache();
    const { frames, scores } = getCachedDetectionData();
    expect(frames).toBeNull();
    expect(scores).toBeNull();
  });

  it("overwrites previous cache", () => {
    cacheDetectionData([{} as never, {} as never], [{} as never]);
    cacheDetectionData([{} as never], [{} as never, {} as never, {} as never]);
    const { frames, scores } = getCachedDetectionData();
    expect(frames).toHaveLength(1);
    expect(scores).toHaveLength(3);
  });
});

// The cache lets a regeneration skip the expensive extraction + scoring phases and re-run only
// the planner. That is ONLY safe if it invalidates when the user swaps to a different project —
// otherwise a regeneration would silently score the wrong video. The source-fingerprint guard
// is what enforces this, and it was previously untested.
describe("detection-cache source-fingerprint invalidation", () => {
  const frames = [{ dataUrl: "data:image/jpeg;base64,abc", timestamp: 1, sourceFileId: "f1" }];
  const scores = [{ index: 0, score: 0.8, label: "test", timestamp: 1, narrativeRole: null }];

  it("returns the cached data when the source files are unchanged", () => {
    cacheDetectionData(frames as never, scores as never, [{ name: "clip.mov", size: 1000 }]);
    const got = getCachedDetectionData([{ name: "clip.mov", size: 1000 }]);
    expect(got.frames).toHaveLength(1);
    expect(got.scores).toHaveLength(1);
  });

  it("invalidates when a source file's size changes (edited/replaced video)", () => {
    cacheDetectionData(frames as never, scores as never, [{ name: "clip.mov", size: 1000 }]);
    const got = getCachedDetectionData([{ name: "clip.mov", size: 2000 }]);
    expect(got.frames).toBeNull();
    expect(got.scores).toBeNull();
  });

  it("invalidates when a source file is added or removed", () => {
    cacheDetectionData(frames as never, scores as never, [{ name: "a.mov", size: 1 }]);
    const got = getCachedDetectionData([
      { name: "a.mov", size: 1 },
      { name: "b.mov", size: 2 },
    ]);
    expect(got.frames).toBeNull();
  });

  it("is order-independent (same files in a different order still hit)", () => {
    cacheDetectionData(frames as never, scores as never, [
      { name: "a.mov", size: 1 },
      { name: "b.mov", size: 2 },
    ]);
    const got = getCachedDetectionData([
      { name: "b.mov", size: 2 },
      { name: "a.mov", size: 1 },
    ]);
    expect(got.frames).toHaveLength(1);
  });

  it("does not run the fingerprint check when queried without source files", () => {
    cacheDetectionData(frames as never, scores as never, [{ name: "a.mov", size: 1 }]);
    const got = getCachedDetectionData();
    expect(got.frames).toHaveLength(1);
  });
});
