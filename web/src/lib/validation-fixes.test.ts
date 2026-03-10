import { describe, it, expect } from "vitest";
import { applyClipFixes } from "./validation-fixes";
import type { EditedClip, ValidationFixes } from "./types";

function makeClip(overrides: Partial<EditedClip> & { id: string; order: number }): EditedClip {
  return {
    sourceFileId: "src-1",
    segment: {
      id: overrides.id,
      sourceFileId: "src-1",
      startTime: 0,
      endTime: 3,
      confidenceScore: 0.9,
      label: "test",
      detectionSources: ["Cloud AI"],
    },
    trimStart: 0,
    trimEnd: 3,
    selectedMusicTrack: null,
    captionText: "",
    captionStyle: "Bold",
    selectedFilter: "None",
    velocityPreset: "normal",
    ...overrides,
  } as EditedClip;
}

describe("applyClipFixes", () => {
  const clips: EditedClip[] = [
    makeClip({ id: "c0", order: 0, captionText: "First" }),
    makeClip({ id: "c1", order: 1, captionText: "Second" }),
    makeClip({ id: "c2", order: 2, captionText: "Third" }),
  ];

  it("returns a copy when no fixes are provided", () => {
    const result = applyClipFixes(clips, {});
    expect(result).toEqual(clips);
    expect(result).not.toBe(clips);
  });

  it("applies clipUpdates by index", () => {
    const fixes: ValidationFixes = {
      clipUpdates: [{ clipIndex: 1, updates: { captionText: "Updated" } }],
    };
    const result = applyClipFixes(clips, fixes);
    expect(result[0].captionText).toBe("First");
    expect(result[1].captionText).toBe("Updated");
    expect(result[2].captionText).toBe("Third");
  });

  it("ignores out-of-bounds clipUpdates", () => {
    const fixes: ValidationFixes = {
      clipUpdates: [{ clipIndex: 99, updates: { captionText: "Nope" } }],
    };
    const result = applyClipFixes(clips, fixes);
    expect(result).toEqual(clips);
  });

  it("removes clips at specified indices and re-numbers order", () => {
    const fixes: ValidationFixes = {
      clipRemovals: [1],
    };
    const result = applyClipFixes(clips, fixes);
    expect(result).toHaveLength(2);
    expect(result[0].captionText).toBe("First");
    expect(result[0].order).toBe(0);
    expect(result[1].captionText).toBe("Third");
    expect(result[1].order).toBe(1);
  });

  it("applies updates before removals", () => {
    const fixes: ValidationFixes = {
      clipUpdates: [{ clipIndex: 0, updates: { captionText: "Patched" } }],
      clipRemovals: [2],
    };
    const result = applyClipFixes(clips, fixes);
    expect(result).toHaveLength(2);
    expect(result[0].captionText).toBe("Patched");
    expect(result[1].captionText).toBe("Second");
  });
});
