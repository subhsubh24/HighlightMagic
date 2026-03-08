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
