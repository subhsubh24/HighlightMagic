import { describe, it, expect } from "vitest";
import { buildFrameBatches, buildSourceFileList, type SourceFileInfo } from "./frame-batching";

// ── buildFrameBatches ──

interface TestFrame {
  sourceFileId: string;
  sourceFileName: string;
  sourceType: "video" | "photo";
  timestamp: number;
}

function makeFrames(sourceId: string, count: number, type: "video" | "photo" = "video"): TestFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    sourceFileId: sourceId,
    sourceFileName: `${sourceId}.mp4`,
    sourceType: type,
    timestamp: i,
  }));
}

describe("buildFrameBatches", () => {
  it("groups frames by source file", () => {
    const frames = [
      ...makeFrames("vid1", 5),
      ...makeFrames("vid2", 3),
    ];
    const batches = buildFrameBatches(frames);
    // Should have separate batches for each source
    const batchSources = batches.map((b) => b[0].sourceFileId);
    expect(batchSources).toContain("vid1");
    expect(batchSources).toContain("vid2");
  });

  it("splits large sources into MAX_FRAMES_PER_BATCH chunks", () => {
    // MAX_FRAMES_PER_BATCH is 35
    const frames = makeFrames("vid1", 80);
    const batches = buildFrameBatches(frames);
    // 80 frames / 35 per batch = 3 batches (35 + 35 + 10)
    expect(batches.length).toBe(3);
    expect(batches[0].length).toBe(35);
    expect(batches[1].length).toBe(35);
    expect(batches[2].length).toBe(10);
  });

  it("preserves frame order within batches", () => {
    const frames = makeFrames("vid1", 10);
    const batches = buildFrameBatches(frames);
    expect(batches.length).toBe(1);
    for (let i = 1; i < batches[0].length; i++) {
      expect(batches[0][i].timestamp).toBeGreaterThan(batches[0][i - 1].timestamp);
    }
  });

  it("handles empty input", () => {
    const batches = buildFrameBatches([]);
    expect(batches).toHaveLength(0);
  });

  it("handles single frame", () => {
    const frames = makeFrames("vid1", 1);
    const batches = buildFrameBatches(frames);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
  });

  it("handles mixed video and photo sources", () => {
    const frames = [
      ...makeFrames("vid1", 5, "video"),
      ...makeFrames("photo1", 1, "photo"),
      ...makeFrames("vid2", 3, "video"),
    ];
    const batches = buildFrameBatches(frames);
    // Photo gets its own batch, videos get their own
    const allFramesInBatches = batches.flat();
    expect(allFramesInBatches.length).toBe(9);
  });

  it("keeps frames from same source in same batch when under limit", () => {
    const frames = makeFrames("vid1", 15);
    const batches = buildFrameBatches(frames);
    expect(batches.length).toBe(1); // 15 < 20
    expect(batches[0].every((f) => f.sourceFileId === "vid1")).toBe(true);
  });
});

// ── buildSourceFileList ──

describe("buildSourceFileList", () => {
  it("builds correct source list from frames", () => {
    const frames = [
      ...makeFrames("vid1", 5),
      ...makeFrames("vid2", 3),
      ...makeFrames("photo1", 1, "photo"),
    ];
    const sourceList = buildSourceFileList(frames);
    expect(sourceList).toHaveLength(3);

    const vid1 = sourceList.find((s) => s.id === "vid1");
    expect(vid1).toBeDefined();
    expect(vid1!.frameCount).toBe(5);
    expect(vid1!.type).toBe("video");

    const vid2 = sourceList.find((s) => s.id === "vid2");
    expect(vid2).toBeDefined();
    expect(vid2!.frameCount).toBe(3);

    const photo1 = sourceList.find((s) => s.id === "photo1");
    expect(photo1).toBeDefined();
    expect(photo1!.frameCount).toBe(1);
    expect(photo1!.type).toBe("photo");
  });

  it("handles empty input", () => {
    const sourceList = buildSourceFileList([]);
    expect(sourceList).toHaveLength(0);
  });

  it("handles single source with many frames", () => {
    const frames = makeFrames("vid1", 50);
    const sourceList = buildSourceFileList(frames);
    expect(sourceList).toHaveLength(1);
    expect(sourceList[0].frameCount).toBe(50);
  });

  it("uses correct name from frames", () => {
    const frames = [
      {
        sourceFileId: "vid1",
        sourceFileName: "my-video.mp4",
        sourceType: "video" as const,
        timestamp: 0,
      },
    ];
    const sourceList = buildSourceFileList(frames);
    expect(sourceList[0].name).toBe("my-video.mp4");
  });
});
