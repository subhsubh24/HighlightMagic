/**
 * Margin cost-per-outcome eval — the GRADER.
 *
 * The grade is derived from the REAL validator signal, NOT a self-report: the metered
 * validator (`web/src/app/api/validate/route.ts`) returns `{ passed, issues, fixes }` after
 * an actual Claude review of the assembled tape. The eval maps that to a productivity score
 * with the SAME formula the app already emits to Margin (validate/route.ts):
 *
 *   qualityScore = 1 - min(issueCount, 5) / 5
 *
 * So 0 issues → 1.0 (clean), 1 issue → 0.8, 3 → 0.4, 5+ → 0.0. This is genuine: a harder or
 * weaker tape genuinely draws more validator issues and therefore scores lower. It is never
 * always-pass — `passed` is whatever the validator decided, and the quality score falls as
 * real issues accumulate. `qualityMethod` is recorded as "llm_judge" so a graded number is
 * never mistaken for a self-report.
 */

/** The raw signal returned by the metered validator route. */
export interface ValidatorSignal {
  passed?: boolean;
  issues?: unknown;
}

/** A fully-graded outcome for one eval case. */
export interface GradedOutcome {
  passed: boolean;
  issueCount: number;
  qualityScore: number;
  qualityMethod: "llm_judge";
}

export const QUALITY_METHOD = "llm_judge" as const;

/** The exact quality-score formula the app emits (validate/route.ts). Clamped to [0,1]. */
export function qualityScoreFromIssues(issueCount: number): number {
  const clamped = Math.min(Math.max(issueCount, 0), 5);
  return 1 - clamped / 5;
}

/** Grade a validator signal into the outcome Margin records. */
export function gradeOutcome(signal: ValidatorSignal): GradedOutcome {
  const issueCount = Array.isArray(signal.issues) ? signal.issues.length : 0;
  return {
    passed: !!signal.passed,
    issueCount,
    qualityScore: qualityScoreFromIssues(issueCount),
    qualityMethod: QUALITY_METHOD,
  };
}

/** Summary statistics over a batch of graded outcomes — the cost-per-outcome denominator. */
export interface OutcomeStats {
  n: number;
  passed: number;
  passRate: number;
  meanQuality: number;
  minQuality: number;
  maxQuality: number;
}

export function summarizeOutcomes(outcomes: GradedOutcome[]): OutcomeStats {
  const n = outcomes.length;
  if (n === 0) {
    return { n: 0, passed: 0, passRate: 0, meanQuality: 0, minQuality: 0, maxQuality: 0 };
  }
  const passed = outcomes.filter((o) => o.passed).length;
  const qualities = outcomes.map((o) => o.qualityScore);
  const meanQuality = qualities.reduce((s, q) => s + q, 0) / n;
  return {
    n,
    passed,
    passRate: passed / n,
    meanQuality,
    minQuality: Math.min(...qualities),
    maxQuality: Math.max(...qualities),
  };
}
