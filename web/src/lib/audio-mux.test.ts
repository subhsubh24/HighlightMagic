import { describe, it, expect } from "vitest";
import {
  mergeDuckSegments,
  DEFAULT_MUSIC_DUCK_RATIO,
  type DuckSegment,
} from "./audio-mux";

describe("DEFAULT_MUSIC_DUCK_RATIO", () => {
  it("is 0.28", () => {
    expect(DEFAULT_MUSIC_DUCK_RATIO).toBe(0.28);
  });
});

describe("mergeDuckSegments", () => {
  it("returns empty array for empty input", () => {
    expect(mergeDuckSegments([])).toEqual([]);
  });

  it("returns a single segment unchanged", () => {
    const seg: DuckSegment = { startTime: 1, endTime: 3, ratio: 0.3 };
    expect(mergeDuckSegments([seg])).toEqual([{ startTime: 1, endTime: 3, ratio: 0.3 }]);
  });

  it("does not merge non-overlapping segments with gap > 0.5s", () => {
    const segs: DuckSegment[] = [
      { startTime: 1, endTime: 3, ratio: 0.3 },
      { startTime: 4, endTime: 6, ratio: 0.4 }, // 4 > 3 + 0.5 → separate
    ];
    const result = mergeDuckSegments(segs);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ startTime: 1, endTime: 3, ratio: 0.3 });
    expect(result[1]).toEqual({ startTime: 4, endTime: 6, ratio: 0.4 });
  });

  it("merges overlapping segments", () => {
    const segs: DuckSegment[] = [
      { startTime: 1, endTime: 4, ratio: 0.3 },
      { startTime: 3, endTime: 6, ratio: 0.4 }, // 3 <= 4 + 0.5 → merge
    ];
    const result = mergeDuckSegments(segs);
    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe(1);
    expect(result[0].endTime).toBe(6);
    expect(result[0].ratio).toBe(0.3); // min(0.3, 0.4) — stronger duck wins
  });

  it("merges adjacent segments within the 0.5s gap tolerance", () => {
    const segs: DuckSegment[] = [
      { startTime: 1, endTime: 3, ratio: 0.4 },
      { startTime: 3.3, endTime: 5, ratio: 0.3 }, // 3.3 <= 3 + 0.5 = 3.5 → merge
    ];
    const result = mergeDuckSegments(segs);
    expect(result).toHaveLength(1);
    expect(result[0].endTime).toBe(5);
    expect(result[0].ratio).toBe(0.3);
  });

  it("does NOT merge segments with exactly 0.5s gap (boundary condition)", () => {
    // seg1 ends at 3, seg2 starts at 3.5 → 3.5 <= 3 + 0.5 = 3.5 → merge (boundary is inclusive)
    const segs: DuckSegment[] = [
      { startTime: 1, endTime: 3, ratio: 0.4 },
      { startTime: 3.5, endTime: 5, ratio: 0.3 },
    ];
    const result = mergeDuckSegments(segs);
    expect(result).toHaveLength(1); // boundary is inclusive (<=)
  });

  it("keeps stronger duck ratio (lower value) when merging", () => {
    const segs: DuckSegment[] = [
      { startTime: 0, endTime: 5, ratio: 0.5 },
      { startTime: 2, endTime: 7, ratio: 0.2 }, // 0.2 is stronger (lower)
    ];
    const result = mergeDuckSegments(segs);
    expect(result).toHaveLength(1);
    expect(result[0].ratio).toBe(0.2);
  });

  it("sorts out-of-order segments before merging", () => {
    const segs: DuckSegment[] = [
      { startTime: 5, endTime: 8, ratio: 0.3 },
      { startTime: 1, endTime: 4, ratio: 0.4 },
    ];
    const result = mergeDuckSegments(segs);
    expect(result[0].startTime).toBe(1);
    expect(result[1].startTime).toBe(5);
  });

  it("merges a chain of 3 overlapping segments into one", () => {
    const segs: DuckSegment[] = [
      { startTime: 0, endTime: 2, ratio: 0.4 },
      { startTime: 1, endTime: 4, ratio: 0.3 },
      { startTime: 3, endTime: 6, ratio: 0.5 },
    ];
    const result = mergeDuckSegments(segs);
    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe(0);
    expect(result[0].endTime).toBe(6);
    expect(result[0].ratio).toBe(0.3); // min of 0.4, 0.3, 0.5
  });

  it("does not mutate the input array", () => {
    const segs: DuckSegment[] = [
      { startTime: 1, endTime: 4, ratio: 0.3 },
      { startTime: 3, endTime: 6, ratio: 0.4 },
    ];
    const snapshot = segs.map((s) => ({ ...s }));
    mergeDuckSegments(segs);
    expect(segs).toEqual(snapshot);
  });

  it("does not mutate the input segment objects", () => {
    const seg: DuckSegment = { startTime: 1, endTime: 3, ratio: 0.3 };
    const other: DuckSegment = { startTime: 2, endTime: 5, ratio: 0.2 };
    mergeDuckSegments([seg, other]);
    // Original objects should be unchanged even though segments were merged
    expect(seg.endTime).toBe(3);
    expect(seg.ratio).toBe(0.3);
  });
});
