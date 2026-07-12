/**
 * KEYLESS gate test for the Margin cost-per-outcome eval.
 *
 * Runs in the required `web` check (vitest include = src/**\/*.test.ts). It makes NO API calls
 * and needs NO key — it validates the two things the eval's honesty rests on:
 *   1. The GRADER math matches the app's emitted formula and is genuinely discriminating
 *      (never always-pass; strictly falls as real validator issues accumulate).
 *   2. The INPUT MATRIX is real and varied: enough cases, all content types, genuinely weak
 *      and hard cases present, and every score profile is well-formed.
 *
 * The real paid round-trip lives in margin-eval.eval.ts (gated on EVAL_MODE=1), never here.
 */
import { describe, it, expect } from "vitest";
import {
  qualityScoreFromIssues,
  gradeOutcome,
  summarizeOutcomes,
  QUALITY_METHOD,
  type GradedOutcome,
} from "./grader";
import {
  INPUT_MATRIX,
  selectCases,
  type ContentType,
  type EvalCase,
} from "./input-matrix";

describe("grader — qualityScore = 1 - min(issues,5)/5", () => {
  it("maps the documented anchor points exactly", () => {
    expect(qualityScoreFromIssues(0)).toBe(1);
    expect(qualityScoreFromIssues(1)).toBeCloseTo(0.8);
    expect(qualityScoreFromIssues(2)).toBeCloseTo(0.6);
    expect(qualityScoreFromIssues(3)).toBeCloseTo(0.4);
    expect(qualityScoreFromIssues(4)).toBeCloseTo(0.2);
    expect(qualityScoreFromIssues(5)).toBe(0);
  });

  it("clamps out-of-range issue counts to [0,1]", () => {
    expect(qualityScoreFromIssues(7)).toBe(0);
    expect(qualityScoreFromIssues(100)).toBe(0);
    expect(qualityScoreFromIssues(-3)).toBe(1);
  });

  it("is strictly non-increasing in issue count (genuinely discriminating)", () => {
    let prev = Infinity;
    for (let i = 0; i <= 6; i++) {
      const q = qualityScoreFromIssues(i);
      expect(q).toBeLessThanOrEqual(prev);
      prev = q;
    }
    // A clean tape and a badly-flagged tape must NOT grade the same — never always-pass.
    expect(qualityScoreFromIssues(0)).toBeGreaterThan(qualityScoreFromIssues(5));
  });

  it("gradeOutcome reads passed + issue count from the real validator signal", () => {
    expect(gradeOutcome({ passed: true, issues: [] })).toEqual({
      passed: true, issueCount: 0, qualityScore: 1, qualityMethod: QUALITY_METHOD,
    });
    expect(gradeOutcome({ passed: false, issues: ["a", "b", "c"] })).toEqual({
      passed: false, issueCount: 3, qualityScore: qualityScoreFromIssues(3), qualityMethod: QUALITY_METHOD,
    });
    // Malformed/absent issues default to 0 (fail-safe), never crash.
    expect(gradeOutcome({ passed: true }).issueCount).toBe(0);
    expect(gradeOutcome({ passed: undefined, issues: "nope" }).passed).toBe(false);
  });

  it("summarizeOutcomes computes the cost-per-outcome denominator", () => {
    const outcomes: GradedOutcome[] = [
      { passed: true, issueCount: 0, qualityScore: 1, qualityMethod: QUALITY_METHOD },
      { passed: false, issueCount: 5, qualityScore: 0, qualityMethod: QUALITY_METHOD },
      { passed: true, issueCount: 2, qualityScore: 0.6, qualityMethod: QUALITY_METHOD },
    ];
    const s = summarizeOutcomes(outcomes);
    expect(s.n).toBe(3);
    expect(s.passed).toBe(2);
    expect(s.passRate).toBeCloseTo(2 / 3);
    expect(s.meanQuality).toBeCloseTo((1 + 0 + 0.6) / 3);
    expect(s.minQuality).toBe(0);
    expect(s.maxQuality).toBe(1);
    expect(summarizeOutcomes([]).n).toBe(0);
  });
});

describe("input matrix — real, representative, and varied", () => {
  const ALL_TYPES: ContentType[] = ["sports", "cooking", "gaming", "travel", "music"];

  it("has 40-80 cases (a genuine distribution, not a happy path)", () => {
    expect(INPUT_MATRIX.length).toBeGreaterThanOrEqual(40);
    expect(INPUT_MATRIX.length).toBeLessThanOrEqual(80);
  });

  it("covers every content type", () => {
    for (const t of ALL_TYPES) {
      expect(INPUT_MATRIX.some((c) => c.contentType === t)).toBe(true);
    }
  });

  it("spans all length classes and hook strengths", () => {
    const lengths = new Set(INPUT_MATRIX.map((c) => c.lengthClass));
    const hooks = new Set(INPUT_MATRIX.map((c) => c.hookStrength));
    expect(lengths).toEqual(new Set(["short", "medium", "long"]));
    expect(hooks).toEqual(new Set(["strong", "moderate", "weak"]));
  });

  it("includes genuinely WEAK and HARD cases (so a real run cannot always-pass)", () => {
    const weak = INPUT_MATRIX.filter((c) => c.hookStrength === "weak");
    const hard = INPUT_MATRIX.filter((c) => c.difficulty === "hard");
    // Each content type has weak+hard variants → at least one per type.
    expect(weak.length).toBeGreaterThanOrEqual(ALL_TYPES.length);
    expect(hard.length).toBeGreaterThanOrEqual(ALL_TYPES.length);
  });

  it("has multi-source cases (varied clip sets)", () => {
    expect(INPUT_MATRIX.some((c) => c.sources.length >= 2)).toBe(true);
  });

  it("every case has unique id and a well-formed score profile", () => {
    const ids = new Set<string>();
    for (const c of INPUT_MATRIX) {
      expect(ids.has(c.id), `duplicate id ${c.id}`).toBe(false);
      ids.add(c.id);

      expect(c.scores.length).toBeGreaterThanOrEqual(3);
      const sourceIds = new Set(c.sources.map((s) => s.id));
      let prevT = -1;
      for (const s of c.scores) {
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(1);
        expect(s.label.trim().length).toBeGreaterThan(0);
        expect(sourceIds.has(s.sourceFileId), `${c.id} score references unknown source`).toBe(true);
        // Timestamps are non-decreasing along the timeline.
        expect(s.timestamp).toBeGreaterThanOrEqual(prevT);
        prevT = s.timestamp;
      }
    }
  });

  it("strong-hook cases genuinely peak earlier/higher than weak-hook cases", () => {
    const peakFrac = (c: EvalCase) => {
      const maxScore = Math.max(...c.scores.map((s) => s.score));
      const peakIdx = c.scores.findIndex((s) => s.score === maxScore);
      return { maxScore, peakPos: peakIdx / (c.scores.length - 1) };
    };
    const strong = INPUT_MATRIX.filter((c) => c.hookStrength === "strong").map(peakFrac);
    const weak = INPUT_MATRIX.filter((c) => c.hookStrength === "weak").map(peakFrac);
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    // Strong hooks peak higher on average AND earlier (smaller peak position).
    expect(mean(strong.map((p) => p.maxScore))).toBeGreaterThan(mean(weak.map((p) => p.maxScore)));
    expect(mean(strong.map((p) => p.peakPos))).toBeLessThan(mean(weak.map((p) => p.peakPos)));
  });
});

describe("selectCases — cost-capped, deterministic slicing", () => {
  it("limits, filters by content type and difficulty, and is stable", () => {
    expect(selectCases({ limit: 5 }).length).toBe(5);
    expect(selectCases({ limit: 5 })).toEqual(selectCases({ limit: 5 }));
    expect(selectCases({ contentType: "gaming" }).every((c) => c.contentType === "gaming")).toBe(true);
    expect(selectCases({ difficulty: "hard" }).every((c) => c.difficulty === "hard")).toBe(true);
    expect(selectCases({ limit: 0 }).length).toBe(0);
    expect(selectCases().length).toBe(INPUT_MATRIX.length);
  });
});
