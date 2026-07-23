import { describe, it, expect } from "vitest";
import { selectPlannerFrames, frameKey } from "@/lib/detect-planner-frames";
import type { ScoredFrame, MultiFrameInput } from "@/actions/detect";

// Small base64 payload by default so byte-budget/size caps never trip unless a test opts in.
const SMALL = "x".repeat(16);

function mkFrame(
  sourceFileId: string,
  timestamp: number,
  opts: { sourceType?: "video" | "photo"; base64?: string } = {},
): MultiFrameInput {
  return {
    sourceFileId,
    sourceFileName: `${sourceFileId}.mp4`,
    sourceType: opts.sourceType ?? "video",
    timestamp,
    base64: opts.base64 ?? SMALL,
  };
}

function mkScore(
  sourceFileId: string,
  timestamp: number,
  score: number,
  opts: { sourceType?: "video" | "photo" } = {},
): ScoredFrame {
  return {
    sourceFileId,
    sourceType: opts.sourceType ?? "video",
    timestamp,
    score,
    label: "moment",
  };
}

/** Build a matched score+frame pair from the same source/timestamp. */
function pair(
  sourceFileId: string,
  timestamp: number,
  score: number,
  opts: { sourceType?: "video" | "photo"; base64?: string } = {},
): { s: ScoredFrame; f: MultiFrameInput } {
  return {
    s: mkScore(sourceFileId, timestamp, score, { sourceType: opts.sourceType }),
    f: mkFrame(sourceFileId, timestamp, opts),
  };
}

describe("frameKey", () => {
  it("formats id::timestamp with ms (3-decimal) precision", () => {
    expect(frameKey("a", 1.2)).toBe("a::1.200");
    expect(frameKey("vid-1", 0)).toBe("vid-1::0.000");
    // 3 decimals disambiguate ms-scale timestamps that .toFixed(1) would collide onto "1.2".
    expect(frameKey("a", 1.234)).toBe("a::1.234");
    expect(frameKey("a", 1.234)).not.toBe(frameKey("a", 1.236));
  });
});

describe("selectPlannerFrames", () => {
  it("returns [] for empty input", () => {
    expect(selectPlannerFrames([], [])).toEqual([]);
  });

  it("selects the small no-limit set and sorts by (source, timestamp)", () => {
    const p = [
      pair("b", 5, 0.9),
      pair("a", 2, 0.5),
      pair("a", 0, 0.8),
    ];
    const out = selectPlannerFrames(p.map((x) => x.s), p.map((x) => x.f));
    expect(out).toHaveLength(3);
    // sorted by sourceFileId asc, then timestamp asc
    expect(out.map((f) => `${f.sourceFileId}@${f.timestamp}`)).toEqual([
      "a@0",
      "a@2",
      "b@5",
    ]);
  });

  it("gives every source at least one frame (distribution fairness)", () => {
    const p = [
      pair("a", 0, 0.99),
      pair("a", 4, 0.98),
      pair("b", 0, 0.10), // b's best is far below a's — but b must still appear
    ];
    const out = selectPlannerFrames(p.map((x) => x.s), p.map((x) => x.f));
    const sources = new Set(out.map((f) => f.sourceFileId));
    expect(sources.has("a")).toBe(true);
    expect(sources.has("b")).toBe(true);
  });

  it("never selects a score whose frame is absent from the frame list", () => {
    const scores = [mkScore("a", 0, 0.9), mkScore("a", 1, 0.8)];
    const frames = [mkFrame("a", 0)]; // no frame for a@1
    const out = selectPlannerFrames(scores, frames);
    expect(out).toHaveLength(1);
    expect(out[0].timestamp).toBe(0);
  });

  it("never double-selects the same (source, timestamp) frame from duplicate scores", () => {
    const scores = [mkScore("a", 0, 0.9), mkScore("a", 0, 0.7)]; // duplicate key
    const frames = [mkFrame("a", 0)];
    const out = selectPlannerFrames(scores, frames);
    expect(out).toHaveLength(1);
  });

  it("skips a single oversized frame (> 5 MB base64) but keeps the rest", () => {
    const big = "x".repeat(5 * 1024 * 1024 + 1); // exceeds API_MAX_IMAGE_BYTES
    const p = [
      pair("a", 0, 0.9, { base64: big }),
      pair("a", 4, 0.8),
    ];
    const out = selectPlannerFrames(p.map((x) => x.s), p.map((x) => x.f));
    expect(out).toHaveLength(1);
    expect(out[0].timestamp).toBe(4);
  });

  it("respects the ~9 MB payload budget and enforces temporal diversity under pressure", () => {
    // Each frame ~4 MB → only two fit under the 9 MB budget. All from one source.
    const big = "x".repeat(4 * 1024 * 1024);
    const scores = [
      mkScore("a", 0, 0.9),
      mkScore("a", 1, 0.85), // within 3s of a@0 → skipped by the temporal gap in phase 2
      mkScore("a", 10, 0.5),
    ];
    const frames = [
      mkFrame("a", 0, { base64: big }),
      mkFrame("a", 1, { base64: big }),
      mkFrame("a", 10, { base64: big }),
    ];
    const out = selectPlannerFrames(scores, frames);
    // Phase 1 takes a@0 (best); phase 2 skips a@1 (too close to a@0) and takes a@10; budget now full.
    expect(out.map((f) => f.timestamp)).toEqual([0, 10]);
  });

  it("enforces the 70% per-source cap by shedding the lowest-scored surplus frames", () => {
    // Source "a" has 9 frames (4s apart so no temporal-gap skips); source "b" has 1.
    const aScores = [0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.2, 0.1];
    const aTimes = aScores.map((_, i) => i * 4);
    const scores: ScoredFrame[] = aScores.map((sc, i) => mkScore("a", aTimes[i], sc));
    scores.push(mkScore("b", 0, 0.5));
    const frames: MultiFrameInput[] = aTimes.map((t) => mkFrame("a", t));
    frames.push(mkFrame("b", 0));

    const out = selectPlannerFrames(scores, frames);
    const aCount = out.filter((f) => f.sourceFileId === "a").length;
    // 10 selected pre-cap → maxPerSource = ceil(10 * 0.7) = 7 → a shed down to 7.
    expect(aCount).toBe(7);
    expect(out.some((f) => f.sourceFileId === "b")).toBe(true);
    // The two lowest-scored a frames (0.1 @ t=32, 0.2 @ t=28) are the ones shed.
    const aTimestamps = out.filter((f) => f.sourceFileId === "a").map((f) => f.timestamp);
    expect(aTimestamps).not.toContain(32);
    expect(aTimestamps).not.toContain(28);
  });

  it("caps video-heavy input at 60 frames", () => {
    // 61 unique video sources, one frame each → per-source cap can't trigger (1 each).
    const scores: ScoredFrame[] = [];
    const frames: MultiFrameInput[] = [];
    for (let i = 0; i < 61; i++) {
      scores.push(mkScore(`v${i}`, 0, 0.5));
      frames.push(mkFrame(`v${i}`, 0));
    }
    const out = selectPlannerFrames(scores, frames);
    expect(out).toHaveLength(60);
  });

  it("raises the cap to 150 for photo-heavy input", () => {
    // 61 unique photo sources → photoRatio 1.0 ≥ 0.5 → cap 150 → all fit.
    const scores: ScoredFrame[] = [];
    const frames: MultiFrameInput[] = [];
    for (let i = 0; i < 61; i++) {
      scores.push(mkScore(`p${i}`, 0, 0.5, { sourceType: "photo" }));
      frames.push(mkFrame(`p${i}`, 0, { sourceType: "photo" }));
    }
    const out = selectPlannerFrames(scores, frames);
    expect(out).toHaveLength(61);
  });
});
