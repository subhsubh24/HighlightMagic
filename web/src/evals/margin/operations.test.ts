/**
 * KEYLESS gate test for the PER-OPERATION Margin eval suites (scorer / planner / validator).
 * Runs in the required `web` check — NO API calls. Validates that each operation grader is
 * GENUINE (discriminating, never always-pass) and that each matrix carries edge/fuzz cases.
 */
import { describe, it, expect } from "vitest";
import {
  OP_WORKFLOW,
  gradeScorerOutput,
  gradePlannerOutput,
  gradeValidatorDiscrimination,
  summarizeOpGrades,
  SCORER_CASES,
  PLANNER_EDGE_CASES,
  VALIDATOR_CASES,
  type PlannerObservation,
} from "./operations";

describe("per-operation workflow ids (supply-chain nodes)", () => {
  it("gives each operation a distinct node id", () => {
    const ids = Object.values(OP_WORKFLOW);
    expect(new Set(ids).size).toBe(ids.length);
    expect(OP_WORKFLOW.scorer).toBe("highlightmagic-scorer");
    expect(OP_WORKFLOW.planner).toBe("highlightmagic-planner");
    expect(OP_WORKFLOW.validator).toBe("highlightmagic-validator");
  });
});

describe("scorer grader — well-formed + non-degenerate + robust", () => {
  const good = {
    frameCount: 3, expectedSourceId: "s", threw: false,
    scores: [
      { score: 0.2, label: "a", sourceFileId: "s" },
      { score: 0.8, label: "b", sourceFileId: "s" },
      { score: 0.5, label: "c", sourceFileId: "s" },
    ],
  };

  it("passes a well-formed, varied score set", () => {
    const g = gradeScorerOutput(good);
    expect(g.passed).toBe(true);
    expect(g.qualityScore).toBe(1);
  });

  it("fails when the scorer threw", () => {
    expect(gradeScorerOutput({ ...good, threw: true }).passed).toBe(false);
  });

  it("fails out-of-range / non-finite scores", () => {
    const g = gradeScorerOutput({ ...good, scores: [{ score: 5, label: "x", sourceFileId: "s" }, { score: NaN, label: "y", sourceFileId: "s" }, { score: 0.5, label: "z", sourceFileId: "s" }] });
    expect(g.passed).toBe(false);
  });

  it("flags a DEGENERATE scorer (constant score across varied frames) via lower quality", () => {
    const degenerate = gradeScorerOutput({ ...good, scores: [
      { score: 0.5, label: "a", sourceFileId: "s" },
      { score: 0.5, label: "b", sourceFileId: "s" },
      { score: 0.5, label: "c", sourceFileId: "s" },
    ] });
    expect(degenerate.checks.find((c) => c.name === "non-degenerate-spread")!.ok).toBe(false);
    expect(degenerate.qualityScore).toBeLessThan(gradeScorerOutput(good).qualityScore);
  });

  it("counts a wrong frame count as a critical failure", () => {
    expect(gradeScorerOutput({ ...good, frameCount: 5 }).passed).toBe(false);
  });
});

describe("planner grader — valid, coherent edit plan", () => {
  const plan = { musicPrompt: "x", sfx: [], voiceover: [], intro: {}, outro: {} };
  const goodObs: PlannerObservation = {
    clips: [
      { startTime: 0, endTime: 3, order: 1, sourceFileId: "s" },
      { startTime: 3, endTime: 6, order: 2, sourceFileId: "s" },
    ],
    detectedTheme: "sports", contentSummary: "a coherent highlight summary", productionPlan: plan, threw: false,
  };
  const exp = { minClips: 1, maxClips: 6, sourceIds: ["s"] };

  it("passes a valid plan with full quality", () => {
    const g = gradePlannerOutput(goodObs, exp);
    expect(g.passed).toBe(true);
    expect(g.qualityScore).toBe(1);
  });

  it("fails clip count out of range (critical)", () => {
    expect(gradePlannerOutput({ ...goodObs, clips: [] }, exp).passed).toBe(false);
  });

  it("fails zero-/negative-duration clips (critical)", () => {
    const bad = { ...goodObs, clips: [{ startTime: 5, endTime: 5, order: 1, sourceFileId: "s" }] };
    expect(gradePlannerOutput(bad, exp).passed).toBe(false);
  });

  it("lowers quality for a missing production plan / fields", () => {
    const noPlan = gradePlannerOutput({ ...goodObs, productionPlan: null }, exp);
    expect(noPlan.qualityScore).toBeLessThan(1);
    expect(noPlan.checks.find((c) => c.name === "production-plan-present")!.ok).toBe(false);
  });
});

describe("validator grader — discrimination (catch bad, pass good)", () => {
  it("credits passing a good tape and failing a bad one", () => {
    expect(gradeValidatorDiscrimination(true, { passed: true, issues: [] }).passed).toBe(true);
    expect(gradeValidatorDiscrimination(false, { passed: false, issues: ["missing source"] }).passed).toBe(true);
    // Flagged issues on a bad tape count as caught even if it "passed".
    expect(gradeValidatorDiscrimination(false, { passed: true, issues: ["weak hook"] }).passed).toBe(true);
  });

  it("penalizes MISSING a bad tape and wrongly failing a good one (never always-pass)", () => {
    expect(gradeValidatorDiscrimination(false, { passed: true, issues: [] }).passed).toBe(false);
    expect(gradeValidatorDiscrimination(true, { passed: false, issues: ["nit"] }).passed).toBe(false);
  });

  it("fails when the validator threw", () => {
    expect(gradeValidatorDiscrimination(true, { passed: true, issues: [], threw: true }).passed).toBe(false);
  });
});

describe("operation matrices — real variety with edge/fuzz", () => {
  it("scorer suite has normal AND edge/fuzz frame cases", () => {
    expect(SCORER_CASES.length).toBeGreaterThanOrEqual(5);
    expect(SCORER_CASES.some((c) => !c.edge)).toBe(true);
    expect(SCORER_CASES.filter((c) => c.edge).length).toBeGreaterThanOrEqual(3);
    expect(new Set(SCORER_CASES.map((c) => c.kind)).size).toBeGreaterThanOrEqual(5);
  });

  it("planner edge suite includes degenerate + adversarial inputs", () => {
    expect(PLANNER_EDGE_CASES.every((c) => c.edge)).toBe(true);
    expect(PLANNER_EDGE_CASES.some((c) => c.scores.every((s) => s.score === 0))).toBe(true); // all-zero
    expect(PLANNER_EDGE_CASES.some((c) => c.scores.length === 1)).toBe(true); // single frame
    expect(PLANNER_EDGE_CASES.some((c) => c.id.includes("adversarial"))).toBe(true); // injection labels
    for (const c of PLANNER_EDGE_CASES) {
      expect(c.scores.length).toBeGreaterThanOrEqual(1);
      expect(c.scores.every((s) => s.score >= 0 && s.score <= 1)).toBe(true);
    }
  });

  it("validator suite has BOTH good and bad labelled tapes (so discrimination is measurable)", () => {
    const good = VALIDATOR_CASES.filter((c) => c.expectPass);
    const bad = VALIDATOR_CASES.filter((c) => !c.expectPass);
    expect(good.length).toBeGreaterThanOrEqual(2);
    expect(bad.length).toBeGreaterThanOrEqual(2);
    expect(VALIDATOR_CASES.some((c) => c.edge)).toBe(true);
    // unique ids, well-formed
    expect(new Set(VALIDATOR_CASES.map((c) => c.id)).size).toBe(VALIDATOR_CASES.length);
    for (const c of VALIDATOR_CASES) {
      expect(c.clips.length).toBeGreaterThanOrEqual(1);
      expect(c.sources.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("summarizeOpGrades", () => {
  it("aggregates pass rate + quality", () => {
    const s = summarizeOpGrades([
      { passed: true, qualityScore: 1, checks: [] },
      { passed: false, qualityScore: 0.5, checks: [] },
    ]);
    expect(s.n).toBe(2);
    expect(s.passRate).toBe(0.5);
    expect(s.meanQuality).toBeCloseTo(0.75);
    expect(summarizeOpGrades([]).n).toBe(0);
  });
});
