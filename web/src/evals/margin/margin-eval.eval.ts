/**
 * Margin cost-per-outcome EVAL RUNNER for the `highlightmagic-tape` supply chain.
 *
 * The tape workflow is a CHAIN of three LLM operations, each with its own economics:
 *     scorer (Haiku vision)  ->  planner (Sonnet)  ->  validator (Haiku)
 *
 * This one runner drives the REAL, metered server-side path and can run EITHER the end-to-end
 * chain OR each operation in isolation as its own supply-chain node, selected with --suite:
 *
 *   --suite tape       end-to-end: score profile -> planFromScores -> POST /api/validate  (default)
 *   --suite scorer     real vision scorer on normal + EDGE/FUZZ pixels; graded well-formed/robust
 *   --suite planner    planFromScores on the full matrix + degenerate/adversarial score profiles
 *   --suite validator  POST /api/validate on labelled good/bad tapes; graded on DISCRIMINATION
 *   --suite all        scorer, planner, validator, then tape (shares the --max-usd budget)
 *
 * Per-operation runs re-tag the app's emits under the node's own workflow id (setMeterWorkflow →
 * "highlightmagic-scorer|planner|validator") and sessionId "eval:<op>:<runid>", so Margin sees each
 * node's cost + graded outcome distinctly (the SUPPLY-CHAIN view). Production is untouched — those
 * overrides are unset in prod, so the app path emits byte-for-byte what it always did.
 *
 * GATED — only runs when EVAL_MODE=1. Normal keyless CI never calls this (vitest only runs *.test.ts;
 * the keyless graders are in grader.test.ts + operations.test.ts). It spends real Anthropic tokens.
 *
 * HOW TO RUN
 *   EVAL_MODE=1 npx tsx web/src/evals/margin/margin-eval.eval.ts --dry-run --suite all
 *   EVAL_MODE=1 ANTHROPIC_API_KEY=... MARGIN_INGEST_URL=... MARGIN_INGEST_KEY=... \
 *     npx tsx web/src/evals/margin/margin-eval.eval.ts --suite planner --max-usd 1.00
 *
 * FLAGS
 *   --suite <s>          scorer|planner|validator|tape|all  (default tape)
 *   --dry-run            no API calls; print the selected cases + a grader demonstration
 *   --max-usd <n>        PER-SUITE cap: stop each suite before its ESTIMATED cost exceeds this
 *                        (default 1.00). --suite all bounds total spend at suites × --max-usd.
 *   --limit <n>          cap the number of cases per suite
 *   --content <type>     tape/planner only: sports|cooking|gaming|travel|music
 *   --difficulty <d>     tape/planner only: easy|medium|hard
 *   --score-samples <k>  tape only: how many cases also run the real vision scorer (default 3)
 *   --run-id <id>        batch id → sessionId="eval:[<op>:]<id>" (default: run-<timestamp>)
 *
 * HONESTY / GAPS: score profiles are synthetic-but-representative (same technique as detect.eval.ts);
 * the scorer's semantic ranking is not asserted (no gold labels for generated pixels) — it is graded
 * on well-formedness/non-degeneracy/robustness; the validator runs text-only. margin-meter v0.1.0
 * outcomes carry no sessionId, so per-op OUTCOME rows are separated by the node workflow id while
 * CALL rows carry both the node workflow id and the eval sessionId. See COVERAGE.md.
 */

if (process.env.EVAL_MODE !== "1") {
  console.error(
    "[eval] This eval is gated. Set EVAL_MODE=1 to run it.\n" +
      "       Real run makes real Anthropic calls (bounded by --max-usd) and emits to Margin.\n" +
      "       Structure-only check (no keys): EVAL_MODE=1 npx tsx web/src/evals/margin/margin-eval.eval.ts --dry-run --suite all",
  );
  process.exit(1);
}

import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { scoreSingleBatch, planFromScores, type DetectionResult } from "../../actions/detect";
import { POST as validatePost } from "../../app/api/validate/route";
import { getMeter, setMeterSessionId, setMeterWorkflow } from "../../lib/margin-meter-client";
import { estimateCostUSD, CLAUDE_FRAME_SCORER, CLAUDE_PLANNER, CLAUDE_VALIDATOR } from "../../lib/ai-models";
import { selectCases, type EvalCase, type ContentType, type Difficulty, type EvalFrameScore } from "./input-matrix";
import { gradeOutcome, summarizeOutcomes, type GradedOutcome } from "./grader";
import {
  OP_WORKFLOW,
  gradeScorerOutput,
  gradePlannerOutput,
  gradeValidatorDiscrimination,
  summarizeOpGrades,
  SCORER_CASES,
  PLANNER_EDGE_CASES,
  VALIDATOR_CASES,
  type OpGrade,
  type ScorerCase,
  type FuzzFrameKind,
  type PlannerObservation,
} from "./operations";

const MEDIA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "media");
const SCORER_FIXTURES = ["gen_testpattern_540x960.jpg", "gen_gradient_540x960.jpg", "gen_mandelbrot_540x960.jpg"];

// ── ESTIMATED per-stage cost, used ONLY to enforce the --max-usd cap. Real cost is metered. ──
const EST_SCORER = estimateCostUSD(CLAUDE_FRAME_SCORER, 2200, 800);
const EST_PLANNER = estimateCostUSD(CLAUDE_PLANNER, 3200, 4200);
const EST_VALIDATOR = estimateCostUSD(CLAUDE_VALIDATOR, 1600, 450);

type Suite = "tape" | "scorer" | "planner" | "validator" | "all";

interface Args {
  suite: Suite;
  dryRun: boolean;
  maxUsd: number;
  limit?: number;
  content?: ContentType;
  difficulty?: Difficulty;
  scoreSamples: number;
  runId: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  return {
    suite: (get("--suite") as Suite | undefined) ?? "tape",
    dryRun: argv.includes("--dry-run"),
    maxUsd: Number(get("--max-usd") ?? "1.00"),
    limit: get("--limit") != null ? Number(get("--limit")) : undefined,
    content: get("--content") as ContentType | undefined,
    difficulty: get("--difficulty") as Difficulty | undefined,
    scoreSamples: Number(get("--score-samples") ?? "3"),
    runId: get("--run-id") ?? `run-${Date.now()}`,
  };
}

/** Shared cost budget across suites for a single invocation. */
class Budget {
  spent = 0;
  constructor(public readonly maxUsd: number) {}
  canAfford(est: number): boolean {
    return this.spent + est <= this.maxUsd;
  }
  charge(est: number): void {
    this.spent += est;
  }
}

async function emitOutcome(workflowId: string, g: OpGrade): Promise<void> {
  // setMeterWorkflow (active during a per-op suite) also overrides this workflowId to the node id.
  await getMeter()?.recordOutcome({
    workflowId,
    passed: g.passed,
    qualityScore: g.qualityScore,
    qualityMethod: "llm_judge",
  })?.catch(() => {});
}

function limitCases<T>(cases: T[], limit?: number): T[] {
  return limit != null && limit >= 0 ? cases.slice(0, limit) : cases;
}

// ─────────────────────────────── TAPE (end-to-end) ───────────────────────────────
function framesForCase(c: EvalCase) {
  return c.scores.map((s) => {
    const src = c.sources.find((x) => x.id === s.sourceFileId) ?? c.sources[0];
    return { sourceFileId: s.sourceFileId, sourceFileName: src.name, sourceType: s.sourceType, timestamp: s.timestamp, base64: "" };
  });
}

async function runScorerSample(index: number): Promise<void> {
  const batch = SCORER_FIXTURES.map((file, i) => ({
    sourceFileId: "eval-scorer-fixture", sourceFileName: "eval-scorer-fixture.mp4",
    sourceType: "video" as const, timestamp: i,
    base64: readFileSync(path.join(MEDIA_DIR, file)).toString("base64"),
  }));
  const sourceFiles = [{ id: "eval-scorer-fixture", name: "eval-scorer-fixture.mp4", type: "video" as const, frameCount: batch.length }];
  const scores = await scoreSingleBatch(batch, sourceFiles);
  console.log(`   [scorer sample #${index + 1}] real vision scored ${scores.length} frame(s) (metered)`);
}

async function validateTapeBody(body: Record<string, unknown>, index: number): Promise<{ passed: boolean; issues: unknown; threw: boolean }> {
  const ip = `10.10.${Math.floor(index / 255)}.${index % 255}`;
  try {
    const req = new Request("http://eval.local/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify(body),
    });
    const res = await validatePost(req);
    const data = (await res.json()) as { passed?: boolean; issues?: unknown };
    return { passed: !!data.passed, issues: data.issues, threw: false };
  } catch {
    return { passed: false, issues: [], threw: true };
  }
}

async function runTapeSuite(args: Args, budget: Budget): Promise<GradedOutcome[]> {
  const sessionId = `eval:${args.runId}`;
  setMeterSessionId(sessionId);
  const cases = limitCases(selectCases({ limit: args.limit, contentType: args.content, difficulty: args.difficulty }), args.limit);
  console.log(`\n########## SUITE: tape (end-to-end chain) — ${cases.length} case(s), sessionId=${sessionId} ##########`);

  const outcomes: GradedOutcome[] = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const runScorer = i < args.scoreSamples;
    const est = (runScorer ? EST_SCORER : 0) + EST_PLANNER + EST_VALIDATOR;
    if (!budget.canAfford(est)) { console.log(`   ── budget reached — stopping tape after ${i} case(s) ──`); break; }
    console.log(`\n── [tape ${i + 1}/${cases.length}] ${c.id} ──`);
    try {
      if (runScorer) await runScorerSample(i);
      const result = await planFromScores(framesForCase(c), c.scores, c.templateHint);
      console.log(`   planner: ${result.clips.length} clip(s), theme=${result.detectedTheme}`);
      const signal = await validateTapeBody({
        clips: result.clips, plan: result.productionPlan, contentSummary: result.contentSummary,
        detectedTheme: result.detectedTheme, sourceFiles: c.sources.map((s) => ({ id: s.id, name: s.name, type: s.type })),
      }, i);
      const outcome = gradeOutcome(signal);
      budget.charge(est);
      outcomes.push(outcome);
      console.log(`   validator: passed=${outcome.passed} issues=${outcome.issueCount} → quality=${outcome.qualityScore.toFixed(2)} (emitted)`);
    } catch (err) {
      console.error(`   ✗ case errored (continuing): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  setMeterSessionId(undefined);
  const s = summarizeOutcomes(outcomes);
  console.log(`   tape summary: n=${s.n} pass=${(s.passRate * 100).toFixed(0)}% meanQuality=${s.meanQuality.toFixed(2)}`);
  return outcomes;
}

// ─────────────────────────────── SCORER (per-node) ───────────────────────────────
const SCORER_SOURCE = "eval-scorer";
const W = 180, H = 320;

async function jpegFor(kind: FuzzFrameKind): Promise<string> {
  const toB64 = (b: Buffer) => b.toString("base64");
  switch (kind) {
    case "checker": return toB64(readFileSync(path.join(MEDIA_DIR, "gen_testpattern_540x960.jpg")));
    case "gradient": return toB64(readFileSync(path.join(MEDIA_DIR, "gen_gradient_540x960.jpg")));
    case "black": return toB64(await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg().toBuffer());
    case "white": return toB64(await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } }).jpeg().toBuffer());
    case "tiny": return toB64(await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 120, g: 120, b: 120 } } }).jpeg().toBuffer());
    case "duplicate": return toB64(readFileSync(path.join(MEDIA_DIR, "gen_mandelbrot_540x960.jpg")));
    case "noise": {
      const raw = Buffer.allocUnsafe(W * H * 3);
      for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256);
      return toB64(await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).jpeg().toBuffer());
    }
  }
}

async function scorerBatch(c: ScorerCase) {
  let b64: string[];
  if (c.kind === "duplicate") {
    const one = await jpegFor("duplicate");
    b64 = Array.from({ length: c.frameCount }, () => one);
  } else {
    b64 = await Promise.all(Array.from({ length: c.frameCount }, () => jpegFor(c.kind)));
  }
  return b64.map((base64, i) => ({ sourceFileId: SCORER_SOURCE, sourceFileName: "eval-scorer.mp4", sourceType: "video" as const, timestamp: i, base64 }));
}

async function runScorerSuite(args: Args, budget: Budget): Promise<OpGrade[]> {
  const sessionId = `eval:scorer:${args.runId}`;
  setMeterWorkflow(OP_WORKFLOW.scorer);
  setMeterSessionId(sessionId);
  const cases = limitCases(SCORER_CASES, args.limit);
  console.log(`\n########## SUITE: scorer (node=${OP_WORKFLOW.scorer}) — ${cases.length} case(s), sessionId=${sessionId} ##########`);

  const grades: OpGrade[] = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    if (!budget.canAfford(EST_SCORER)) { console.log(`   ── budget reached — stopping scorer after ${i} case(s) ──`); break; }
    console.log(`\n── [scorer ${i + 1}/${cases.length}] ${c.id}${c.edge ? " (edge/fuzz)" : ""} ──`);
    let threw = false;
    let scores: Array<{ score: number; label: string; sourceFileId: string }> = [];
    try {
      const batch = await scorerBatch(c);
      const sourceFiles = [{ id: SCORER_SOURCE, name: "eval-scorer.mp4", type: "video" as const, frameCount: batch.length }];
      const out = await scoreSingleBatch(batch, sourceFiles);
      scores = out.map((s) => ({ score: s.score, label: s.label, sourceFileId: s.sourceFileId }));
    } catch (err) {
      threw = true;
      console.error(`   scorer threw: ${err instanceof Error ? err.message : String(err)}`);
    }
    budget.charge(EST_SCORER);
    const g = gradeScorerOutput({ frameCount: c.frameCount, expectedSourceId: SCORER_SOURCE, scores, threw });
    await emitOutcome(OP_WORKFLOW.scorer, g);
    grades.push(g);
    console.log(`   graded: passed=${g.passed} quality=${g.qualityScore.toFixed(2)} (${scores.length} scores; emitted)`);
  }
  setMeterSessionId(undefined);
  setMeterWorkflow(undefined);
  const s = summarizeOpGrades(grades);
  console.log(`   scorer summary: n=${s.n} pass=${(s.passRate * 100).toFixed(0)}% meanQuality=${s.meanQuality.toFixed(2)}`);
  return grades;
}

// ─────────────────────────────── PLANNER (per-node) ───────────────────────────────
interface PlannerRun {
  id: string;
  frames: Array<{ sourceFileId: string; sourceFileName: string; sourceType: "video" | "photo"; timestamp: number; base64: string }>;
  scores: EvalFrameScore[];
  templateHint: string;
  exp: { minClips: number; maxClips: number; sourceIds: string[] };
  edge: boolean;
}

function plannerRuns(args: Args): PlannerRun[] {
  const matrix = selectCases({ limit: args.limit, contentType: args.content, difficulty: args.difficulty }).map<PlannerRun>((c) => ({
    id: c.id, frames: framesForCase(c), scores: c.scores, templateHint: c.templateHint,
    exp: { minClips: 1, maxClips: Math.min(Math.max(c.scores.length, 2), 12), sourceIds: c.sources.map((s) => s.id) }, edge: false,
  }));
  const edges = PLANNER_EDGE_CASES.map<PlannerRun>((ec) => ({
    id: ec.id,
    frames: ec.scores.map((s) => ({ sourceFileId: s.sourceFileId, sourceFileName: ec.sourceName, sourceType: "video" as const, timestamp: s.timestamp, base64: "" })),
    scores: ec.scores, templateHint: ec.templateHint, exp: ec.expectation, edge: true,
  }));
  // Front-load the edge/fuzz cases so a small budget still exercises the hard tail.
  return limitCases([...edges, ...matrix], args.limit);
}

async function runPlannerSuite(args: Args, budget: Budget): Promise<OpGrade[]> {
  const sessionId = `eval:planner:${args.runId}`;
  setMeterWorkflow(OP_WORKFLOW.planner);
  setMeterSessionId(sessionId);
  const runs = plannerRuns(args);
  console.log(`\n########## SUITE: planner (node=${OP_WORKFLOW.planner}) — ${runs.length} case(s), sessionId=${sessionId} ##########`);

  const grades: OpGrade[] = [];
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (!budget.canAfford(EST_PLANNER)) { console.log(`   ── budget reached — stopping planner after ${i} case(s) ──`); break; }
    console.log(`\n── [planner ${i + 1}/${runs.length}] ${r.id}${r.edge ? " (edge/fuzz)" : ""} ──`);
    let obs: PlannerObservation = { clips: [], detectedTheme: "", contentSummary: "", productionPlan: null, threw: true };
    try {
      const result: DetectionResult = await planFromScores(r.frames, r.scores, r.templateHint);
      obs = {
        clips: result.clips.map((c) => ({ startTime: c.startTime, endTime: c.endTime, order: c.order, sourceFileId: c.sourceFileId })),
        detectedTheme: result.detectedTheme, contentSummary: result.contentSummary,
        productionPlan: (result.productionPlan as unknown as Record<string, unknown>) ?? null, threw: false,
      };
      console.log(`   planner: ${result.clips.length} clip(s), theme=${result.detectedTheme}`);
    } catch (err) {
      console.error(`   planner threw: ${err instanceof Error ? err.message : String(err)}`);
    }
    budget.charge(EST_PLANNER);
    const g = gradePlannerOutput(obs, r.exp);
    await emitOutcome(OP_WORKFLOW.planner, g);
    grades.push(g);
    console.log(`   graded: passed=${g.passed} quality=${g.qualityScore.toFixed(2)} (emitted)`);
  }
  setMeterSessionId(undefined);
  setMeterWorkflow(undefined);
  const s = summarizeOpGrades(grades);
  console.log(`   planner summary: n=${s.n} pass=${(s.passRate * 100).toFixed(0)}% meanQuality=${s.meanQuality.toFixed(2)}`);
  return grades;
}

// ─────────────────────────────── VALIDATOR (per-node) ───────────────────────────────
async function runValidatorSuite(args: Args, budget: Budget): Promise<OpGrade[]> {
  const sessionId = `eval:validator:${args.runId}`;
  setMeterWorkflow(OP_WORKFLOW.validator);
  setMeterSessionId(sessionId);
  const cases = limitCases(VALIDATOR_CASES, args.limit);
  console.log(`\n########## SUITE: validator (node=${OP_WORKFLOW.validator}) — ${cases.length} case(s), sessionId=${sessionId} ##########`);

  const grades: OpGrade[] = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    if (!budget.canAfford(EST_VALIDATOR)) { console.log(`   ── budget reached — stopping validator after ${i} case(s) ──`); break; }
    console.log(`\n── [validator ${i + 1}/${cases.length}] ${c.id} (expectPass=${c.expectPass}${c.edge ? ", edge/fuzz" : ""}) ──`);
    const signal = await validateTapeBody({
      clips: c.clips, plan: { editingPhilosophy: "eval" }, contentSummary: c.contentSummary,
      detectedTheme: c.detectedTheme, sourceFiles: c.sources,
    }, i);
    budget.charge(EST_VALIDATOR);
    const g = gradeValidatorDiscrimination(c.expectPass, signal);
    await emitOutcome(OP_WORKFLOW.validator, g);
    grades.push(g);
    const issueCount = Array.isArray(signal.issues) ? signal.issues.length : 0;
    console.log(`   validator said passed=${signal.passed} issues=${issueCount} → correct=${g.passed} quality=${g.qualityScore.toFixed(2)} (emitted)`);
  }
  setMeterSessionId(undefined);
  setMeterWorkflow(undefined);
  const s = summarizeOpGrades(grades);
  console.log(`   validator summary: discrimination n=${s.n} accuracy=${(s.passRate * 100).toFixed(0)}%`);
  return grades;
}

// ─────────────────────────────── DRY RUN ───────────────────────────────
function dryRun(args: Args, suites: Suite[]): void {
  console.log("\n── DRY RUN — no API calls ──");
  for (const suite of suites) {
    if (suite === "tape") {
      const cases = limitCases(selectCases({ limit: args.limit, contentType: args.content, difficulty: args.difficulty }), args.limit);
      console.log(`\n[tape] ${cases.length} case(s):`);
      cases.slice(0, 8).forEach((c) => console.log(`   ${c.id.padEnd(34)} ${c.description}`));
      console.log("   grader: qualityScore = 1 - min(issues,5)/5");
    } else if (suite === "scorer") {
      const cases = limitCases(SCORER_CASES, args.limit);
      console.log(`\n[scorer] ${cases.length} case(s) (node=${OP_WORKFLOW.scorer}):`);
      cases.forEach((c) => console.log(`   ${c.id.padEnd(30)} ${c.edge ? "EDGE " : "     "}${c.description}`));
    } else if (suite === "planner") {
      const runs = plannerRuns(args);
      console.log(`\n[planner] ${runs.length} case(s) (node=${OP_WORKFLOW.planner}), ${runs.filter((r) => r.edge).length} edge/fuzz`);
      runs.filter((r) => r.edge).forEach((r) => console.log(`   EDGE  ${r.id}`));
    } else if (suite === "validator") {
      const cases = limitCases(VALIDATOR_CASES, args.limit);
      console.log(`\n[validator] ${cases.length} labelled tapes (node=${OP_WORKFLOW.validator}):`);
      cases.forEach((c) => console.log(`   expectPass=${String(c.expectPass).padEnd(5)} ${c.edge ? "EDGE " : "     "}${c.id}`));
    }
  }
  console.log("\n   DRY RUN complete — suites + graders validated, no API calls made.");
}

// ─────────────────────────────── MAIN ───────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const suites: Suite[] = args.suite === "all" ? ["scorer", "planner", "validator", "tape"] : [args.suite];

  console.log("HighlightMagic — Margin cost-per-outcome eval (per-operation supply chain)");
  console.log("=========================================================================");
  console.log(`   run-id:   ${args.runId}    suite(s): ${suites.join(", ")}    provider: anthropic`);
  console.log(`   max-usd:  $${args.maxUsd.toFixed(2)} PER-SUITE (ESTIMATED cap; real cost is metered)`);
  console.log(`   mode:     ${args.dryRun ? "DRY RUN — no API calls" : "REAL — metered emit to Margin"}`);

  if (args.dryRun) return dryRun(args, suites);

  console.log(`   ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "set ✓" : "MISSING ✗"}`);
  console.log(`   MARGIN_INGEST_KEY: ${process.env.MARGIN_INGEST_KEY ? "set ✓ (emits)" : "MISSING — will run but NOT emit to Margin"}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("\n[eval] No ANTHROPIC_API_KEY — cannot run the real path. Use --dry-run to validate. Exiting cleanly.");
    return; // fail-safe
  }
  if (!process.env.MARGIN_INGEST_KEY) {
    console.warn("\n[eval] WARNING: MARGIN_INGEST_KEY is unset — real calls run but telemetry will NOT reach Margin (no-op).");
  }

  // Each suite gets its OWN --max-usd budget (a PER-SUITE cap), so running --suite all still
  // exercises + EMITS every supply-chain node (scorer/planner/validator/tape) instead of a shared
  // budget starving the later suites. Total spend is bounded by suites.length × --max-usd.
  let totalSpent = 0;
  for (const suite of suites) {
    const budget = new Budget(args.maxUsd);
    try {
      if (suite === "scorer") await runScorerSuite(args, budget);
      else if (suite === "planner") await runPlannerSuite(args, budget);
      else if (suite === "validator") await runValidatorSuite(args, budget);
      else if (suite === "tape") await runTapeSuite(args, budget);
    } catch (err) {
      console.error(`[eval] suite ${suite} errored (continuing):`, err instanceof Error ? err.message : String(err));
    }
    totalSpent += budget.spent;
  }

  console.log("\n══════════════════════════════════════════════");
  console.log(`RUN COMPLETE — est. spend ~$${totalSpent.toFixed(3)} (per-suite cap $${args.maxUsd.toFixed(2)} × ${suites.length} suite(s)).`);
  console.log("Per-operation economics are on Margin under the node workflow ids + sessionId=eval:<op>:" + args.runId + ".");
  console.log("Note: non-trivial FAIL/low-quality counts are expected — the suites include edge/fuzz + weak cases.");
  console.log("══════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("[eval] Unhandled error:", err);
  process.exit(1);
});
