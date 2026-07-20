import { describe, it, expect } from "vitest";
import { normalizeScoresAcrossBatches } from "./detect-normalize";
import type { ScoredFrame } from "@/actions/detect";

/**
 * normalizeScoresAcrossBatches makes frame scores from separately-batched sources
 * directly comparable (z-score per source, then min-max to [0,1]). Wrong normalization
 * skews which frames the planner selects, so the math is locked here.
 */

function frame(sourceFileId: string, score: number, extra: Partial<ScoredFrame> = {}): ScoredFrame {
  return {
    sourceFileId,
    sourceType: "video",
    timestamp: 0,
    score,
    label: "x",
    ...extra,
  };
}

const scoresOf = (fs: ScoredFrame[]) => fs.map((f) => f.score);

describe("normalizeScoresAcrossBatches", () => {
  it("returns the input untouched when empty", () => {
    const input: ScoredFrame[] = [];
    expect(normalizeScoresAcrossBatches(input)).toBe(input);
  });

  it("maps a single frame to the neutral 0.5 (no variance, no range)", () => {
    const out = normalizeScoresAcrossBatches([frame("a", 7)]);
    expect(out[0].score).toBe(0.5);
  });

  it("maps all-identical scores to 0.5 (zero range across sources)", () => {
    const out = normalizeScoresAcrossBatches([frame("a", 5), frame("a", 5), frame("b", 5)]);
    expect(scoresOf(out)).toEqual([0.5, 0.5, 0.5]);
  });

  it("rescales a single source's distinct scores to span [0,1]", () => {
    const out = normalizeScoresAcrossBatches([frame("a", 2), frame("a", 8)]);
    // z = [-1, 1], min-max → [0, 1]
    expect(scoresOf(out)).toEqual([0, 1]);
  });

  it("makes different-magnitude sources comparable (both tops → 1, both bottoms → 0)", () => {
    // Source A around 0-10, source B around 40-60: without z-scoring, B would dominate.
    const out = normalizeScoresAcrossBatches([
      frame("a", 0),
      frame("a", 10),
      frame("b", 40),
      frame("b", 60),
    ]);
    // each source z-normalizes to [-1, 1]; combined range is [-1, 1] → [0, 1]
    expect(scoresOf(out)).toEqual([0, 1, 0, 1]);
  });

  it("preserves within-source ordering after normalization", () => {
    const out = normalizeScoresAcrossBatches([frame("a", 1), frame("a", 5), frame("a", 9)]);
    expect(out[0].score).toBeLessThan(out[1].score);
    expect(out[1].score).toBeLessThan(out[2].score);
    // symmetric spread → middle lands at 0.5
    expect(out[0].score).toBe(0);
    expect(out[1].score).toBeCloseTo(0.5, 10);
    expect(out[2].score).toBe(1);
  });

  it("clamps every output into [0,1]", () => {
    const out = normalizeScoresAcrossBatches([
      frame("a", -100),
      frame("a", 0),
      frame("a", 100),
      frame("b", 50),
    ]);
    for (const f of out) {
      expect(f.score).toBeGreaterThanOrEqual(0);
      expect(f.score).toBeLessThanOrEqual(1);
    }
  });

  it("treats near-identical scores (std below the 0.001 floor) as no variance", () => {
    // stdDev ≈ 0.00025 < 0.001 → both z=0 → range 0 → both 0.5
    const out = normalizeScoresAcrossBatches([frame("a", 5.0), frame("a", 5.0005)]);
    expect(scoresOf(out)).toEqual([0.5, 0.5]);
  });

  it("only rewrites score, preserving every other field", () => {
    const out = normalizeScoresAcrossBatches([
      frame("a", 3, { timestamp: 1.5, label: "hook", narrativeRole: "HOOK", sourceType: "photo", cluster: "g1" }),
      frame("a", 9, { timestamp: 2.0, label: "hero" }),
    ]);
    expect(out[0]).toMatchObject({
      sourceFileId: "a",
      sourceType: "photo",
      timestamp: 1.5,
      label: "hook",
      narrativeRole: "HOOK",
      cluster: "g1",
    });
    expect(out[1]).toMatchObject({ sourceFileId: "a", timestamp: 2.0, label: "hero" });
    // scores were transformed, not left as the raw 3/9
    expect(out[0].score).toBe(0);
    expect(out[1].score).toBe(1);
  });

  it("does not mutate the input frames (returns new objects)", () => {
    const input = [frame("a", 2), frame("a", 8)];
    const out = normalizeScoresAcrossBatches(input);
    expect(input[0].score).toBe(2); // original untouched
    expect(input[1].score).toBe(8);
    expect(out[0]).not.toBe(input[0]);
  });
});
