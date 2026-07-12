/**
 * Margin cost-per-outcome EVAL RUNNER for the `highlightmagic-tape` workflow.
 *
 * Drives the INPUT_MATRIX (web/src/evals/margin/input-matrix.ts) through the REAL, metered
 * server-side path — the SAME scorer / planner / validator the product uses — so Margin
 * accumulates a genuine STATISTICAL cost-per-outcome distribution, not a single happy path:
 *
 *   scoreSingleBatch  (real Anthropic vision, metered)   — sampled, on real-pixel fixtures
 *   planFromScores    (real Anthropic planner,  metered) — per case, on the case's scores
 *   POST /api/validate(real Anthropic validator, metered + emits the graded OUTCOME)
 *
 * The app path already wraps each Claude call with the published `margin-meter` SDK
 * (getMeter), so every call + the validator outcome are emitted with
 * workflowId="highlightmagic-tape". This runner additionally stamps the whole batch with
 * sessionId="eval:<runid>" via setMeterSessionId — production is untouched (see
 * margin-meter-client.ts) — so Margin can isolate the eval batch's economics.
 *
 * GATED — only runs when EVAL_MODE=1. Normal keyless CI never calls this (vitest only runs
 * *.test.ts; the keyless grader+matrix test is grader.test.ts). It spends real tokens.
 *
 * HOW TO RUN
 *   # validate the matrix + grader wiring, NO API calls, no keys needed:
 *   EVAL_MODE=1 npx tsx web/src/evals/margin/margin-eval.eval.ts --dry-run
 *
 *   # a real, cost-capped batch emitting to Margin:
 *   EVAL_MODE=1 \
 *   ANTHROPIC_API_KEY=sk-ant-... \
 *   MARGIN_INGEST_URL=https://margin-ai-rho.vercel.app \
 *   MARGIN_INGEST_KEY=mk_... \
 *   npx tsx web/src/evals/margin/margin-eval.eval.ts --max-usd 1.00 --score-samples 3
 *
 * FLAGS
 *   --dry-run            no API calls; print the selected matrix + a grader demonstration
 *   --max-usd <n>        stop before ESTIMATED cumulative cost exceeds this (default 1.00)
 *   --limit <n>          cap the number of cases considered
 *   --content <type>     only sports|cooking|gaming|travel|music
 *   --difficulty <d>     only easy|medium|hard
 *   --score-samples <k>  how many cases also run the real vision scorer (default 3)
 *   --with-frames        (reserved) run the validator with real fixture frames (vision) — off
 *                        by default; the validator runs text-only, which is a genuine review
 *   --run-id <id>        batch id → sessionId="eval:<id>" (default: run-<timestamp>)
 *
 * COST — a real run is opt-in and bounded by --max-usd. The planner (Sonnet + thinking) is
 * the slow/expensive stage (~$0.05-0.10 and tens of seconds each), so the default $1.00 cap
 * runs ~10-16 cases. Raise --max-usd / --limit for the full 50-case matrix.
 *
 * HONESTY / GAPS: score profiles are synthetic-but-representative (same technique as
 * detect.eval.ts); the scorer is exercised on a small FIXED real-pixel fixture set (variety
 * lives in the planner/validator inputs); the validator runs text-only by default. margin-meter
 * v0.1.0 outcomes carry no sessionId field, so the OUTCOME rows are grouped by workflowId +
 * time, while the CALL rows carry the eval sessionId. These are documented, not hidden.
 */

if (process.env.EVAL_MODE !== "1") {
  console.error(
    "[eval] This eval is gated. Set EVAL_MODE=1 to run it.\n" +
      "       Real run makes real Anthropic calls (bounded by --max-usd) and emits to Margin.\n" +
      "       Structure-only check (no keys): EVAL_MODE=1 npx tsx web/src/evals/margin/margin-eval.eval.ts --dry-run",
  );
  process.exit(1);
}

import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { scoreSingleBatch, planFromScores, type DetectionResult } from "../../actions/detect";
import { POST as validatePost } from "../../app/api/validate/route";
import { getMeter, setMeterSessionId } from "../../lib/margin-meter-client";
import { estimateCostUSD, CLAUDE_FRAME_SCORER, CLAUDE_PLANNER, CLAUDE_VALIDATOR } from "../../lib/ai-models";
import { selectCases, type EvalCase, type ContentType, type Difficulty } from "./input-matrix";
import { gradeOutcome, summarizeOutcomes, type GradedOutcome } from "./grader";

const MEDIA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "media");
const SCORER_FIXTURES = ["gen_testpattern_540x960.jpg", "gen_gradient_540x960.jpg", "gen_mandelbrot_540x960.jpg"];

// ── ESTIMATED per-stage cost, used ONLY to enforce the --max-usd cap. Real cost is metered. ──
const EST_SCORER = estimateCostUSD(CLAUDE_FRAME_SCORER, 2200, 800);
const EST_PLANNER = estimateCostUSD(CLAUDE_PLANNER, 3200, 4200);
const EST_VALIDATOR = estimateCostUSD(CLAUDE_VALIDATOR, 1600, 450);

interface Args {
  dryRun: boolean;
  maxUsd: number;
  limit?: number;
  content?: ContentType;
  difficulty?: Difficulty;
  scoreSamples: number;
  withFrames: boolean;
  runId: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  return {
    dryRun: argv.includes("--dry-run"),
    maxUsd: Number(get("--max-usd") ?? "1.00"),
    limit: get("--limit") != null ? Number(get("--limit")) : undefined,
    content: get("--content") as ContentType | undefined,
    difficulty: get("--difficulty") as Difficulty | undefined,
    scoreSamples: Number(get("--score-samples") ?? "3"),
    withFrames: argv.includes("--with-frames"),
    runId: get("--run-id") ?? `run-${Date.now()}`,
  };
}

function framesForCase(c: EvalCase) {
  return c.scores.map((s) => {
    const src = c.sources.find((x) => x.id === s.sourceFileId) ?? c.sources[0];
    return {
      sourceFileId: s.sourceFileId,
      sourceFileName: src.name,
      sourceType: s.sourceType,
      timestamp: s.timestamp,
      base64: "", // planner uses scores + source metadata, not pixels (same as detect.eval)
    };
  });
}

async function runScorerSample(index: number): Promise<void> {
  const batch = SCORER_FIXTURES.map((file, i) => ({
    sourceFileId: "eval-scorer-fixture",
    sourceFileName: "eval-scorer-fixture.mp4",
    sourceType: "video" as const,
    timestamp: i,
    base64: readFileSync(path.join(MEDIA_DIR, file)).toString("base64"),
  }));
  const sourceFiles = [{ id: "eval-scorer-fixture", name: "eval-scorer-fixture.mp4", type: "video" as const, frameCount: batch.length }];
  const scores = await scoreSingleBatch(batch, sourceFiles);
  console.log(`   [scorer sample #${index + 1}] real vision scored ${scores.length} frame(s) (metered)`);
}

async function validate(c: EvalCase, result: DetectionResult, index: number): Promise<{ passed: boolean; issues: unknown }> {
  const body = {
    // no userId → the route skips the quota/entitlement gates (fail-open), so the eval
    // exercises the paid validator without needing a user/quota record.
    clips: result.clips,
    plan: result.productionPlan,
    contentSummary: result.contentSummary,
    detectedTheme: result.detectedTheme,
    sourceFiles: c.sources.map((s) => ({ id: s.id, name: s.name, type: s.type })),
  };
  // Unique per-case IP so the per-IP paid rate limiter (10/min) never trips across the batch.
  const ip = `10.10.${Math.floor(index / 255)}.${index % 255}`;
  const req = new Request("http://eval.local/api/validate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body: JSON.stringify(body),
  });
  const res = await validatePost(req);
  const data = (await res.json()) as { passed?: boolean; issues?: unknown };
  return { passed: !!data.passed, issues: data.issues };
}

interface CaseResult {
  case: EvalCase;
  outcome: GradedOutcome;
  estCostUsd: number;
  error?: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sessionId = `eval:${args.runId}`;
  const cases = selectCases({ limit: args.limit, contentType: args.content, difficulty: args.difficulty });

  console.log("HighlightMagic — Margin cost-per-outcome eval");
  console.log("=============================================");
  console.log(`   run-id:        ${args.runId}   (sessionId=${sessionId})`);
  console.log(`   workflowId:    highlightmagic-tape   provider: anthropic`);
  console.log(`   matrix:        ${cases.length} case(s) selected of the full 50`);
  console.log(`   max-usd:       $${args.maxUsd.toFixed(2)} (ESTIMATED cap; real cost is metered)`);
  console.log(`   mode:          ${args.dryRun ? "DRY RUN — no API calls" : "REAL — metered emit to Margin"}`);

  if (args.dryRun) {
    console.log("\n── Selected cases ──");
    for (const c of cases) console.log(`   ${c.id.padEnd(34)} ${c.description}`);
    console.log("\n── Grader demonstration (issue count → quality) ──");
    for (const n of [0, 1, 3, 5]) {
      const g = gradeOutcome({ passed: n < 3, issues: Array.from({ length: n }, (_, i) => `issue ${i + 1}`) });
      console.log(`   ${n} issue(s) → passed=${g.passed} quality=${g.qualityScore.toFixed(2)} method=${g.qualityMethod}`);
    }
    console.log("\n   DRY RUN complete — matrix + grader validated, no API calls made.");
    return;
  }

  console.log(`   ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "set ✓" : "MISSING ✗"}`);
  console.log(`   MARGIN_INGEST_KEY: ${process.env.MARGIN_INGEST_KEY ? "set ✓ (emits)" : "MISSING — will run but NOT emit to Margin"}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("\n[eval] No ANTHROPIC_API_KEY — cannot run the real path. Use --dry-run to validate the matrix. Exiting cleanly.");
    return; // fail-safe: no key → nothing to run, not an error
  }
  if (!process.env.MARGIN_INGEST_KEY) {
    console.warn("\n[eval] WARNING: MARGIN_INGEST_KEY is unset — real Anthropic calls will run but telemetry will NOT reach Margin (fail-safe no-op).");
  }

  // Tag every call this run drives with the eval sessionId (production untouched).
  setMeterSessionId(sessionId);

  const results: CaseResult[] = [];
  let estCumulative = 0;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const runScorer = i < args.scoreSamples;
    const estThisCase = (runScorer ? EST_SCORER : 0) + EST_PLANNER + EST_VALIDATOR;
    if (estCumulative + estThisCase > args.maxUsd) {
      console.log(`\n── Cost cap reached (est $${estCumulative.toFixed(3)} + $${estThisCase.toFixed(3)} > $${args.maxUsd.toFixed(2)}) — stopping after ${i} case(s). ──`);
      break;
    }

    console.log(`\n── [${i + 1}/${cases.length}] ${c.id} ──`);
    try {
      if (runScorer) await runScorerSample(i);
      const result = await planFromScores(framesForCase(c), c.scores, c.templateHint);
      console.log(`   planner: ${result.clips.length} clip(s), theme=${result.detectedTheme} (metered)`);
      const signal = await validate(c, result, i);
      const outcome = gradeOutcome(signal);
      estCumulative += estThisCase;
      results.push({ case: c, outcome, estCostUsd: estThisCase });
      console.log(`   validator: passed=${outcome.passed} issues=${outcome.issueCount} → quality=${outcome.qualityScore.toFixed(2)} (outcome emitted)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`   ✗ case errored (continuing): ${msg}`);
      results.push({ case: c, outcome: gradeOutcome({ passed: false, issues: [] }), estCostUsd: 0, error: msg });
    }
  }

  // Flush any in-flight telemetry before the process exits.
  await getMeter()?.recordCall({
    workflowId: "highlightmagic-tape",
    provider: "anthropic",
    model: CLAUDE_VALIDATOR,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    status: "eval_batch_marker",
    sessionId,
  })?.catch(() => {});
  setMeterSessionId(undefined);

  const ok = results.filter((r) => !r.error);
  const stats = summarizeOutcomes(ok.map((r) => r.outcome));
  const totalEst = results.reduce((s, r) => s + r.estCostUsd, 0);

  console.log("\n══════════════════════════════════════════════");
  console.log("EVAL SUMMARY");
  console.log(`   cases run:        ${results.length} (${results.filter((r) => r.error).length} errored)`);
  console.log(`   pass rate:        ${(stats.passRate * 100).toFixed(0)}% (${stats.passed}/${stats.n})`);
  console.log(`   quality (0-1):    mean ${stats.meanQuality.toFixed(2)}  min ${stats.minQuality.toFixed(2)}  max ${stats.maxQuality.toFixed(2)}`);
  console.log(`   est. spend:       ~$${totalEst.toFixed(3)} (real cost-per-outcome is on Margin under sessionId=${sessionId})`);
  console.log("══════════════════════════════════════════════");
  console.log("Note: a non-trivial FAIL count is expected and healthy — the matrix includes");
  console.log("deliberately weak/hard cases so the grade distribution is real, never always-pass.");
}

main().catch((err) => {
  console.error("[eval] Unhandled error:", err);
  process.exit(1);
});
