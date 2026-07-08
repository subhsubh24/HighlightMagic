/**
 * Detection quality eval (ROADMAP: Evals).
 *
 * GATED — only runs when EVAL_MODE=1 is set. Normal CI never calls this; it spends
 * real API tokens. Run manually:
 *   EVAL_MODE=1 ANTHROPIC_API_KEY=sk-ant-... npx tsx web/src/evals/detect.eval.ts
 *
 * What it tests: given a golden fixture with pre-computed frame scores, the planner
 * must produce a DetectionResult that meets the quality bar defined in the fixture's
 * `_expected` field. The fixture exercises the real Anthropic API (no mocks).
 *
 * Growing this over time: add more fixtures (e.g. travel, wedding, gaming) and tighten
 * the assertion bounds as the planner improves. Each fixture run reports estimated cost
 * via the CostMeter so regressions in COGS are visible.
 */

if (process.env.EVAL_MODE !== "1") {
  console.error(
    "[eval] This eval is gated. Set EVAL_MODE=1 to run it.\n" +
    "       It makes real Anthropic API calls and costs ~$0.05–0.20 per run.\n" +
    "       Example: EVAL_MODE=1 ANTHROPIC_API_KEY=sk-ant-... npx tsx web/src/evals/detect.eval.ts"
  );
  process.exit(1);
}

import path from "path";
import { readFileSync, readdirSync } from "fs";
import { planFromScores, type ScoredFrame, type DetectionResult } from "../actions/detect";

interface EvalFixture {
  _description: string;
  _templateHint?: string;
  _expected: {
    minClips: number;
    maxClips: number;
    minTotalDurationSec: number;
    maxTotalDurationSec: number;
    acceptableThemes: string[];
    requiredPlanFields: string[];
  };
  frames: Array<{
    sourceFileId: string;
    sourceType: "video" | "photo";
    sourceFileName: string;
    timestamp: number;
    base64: string;
  }>;
  scores: Array<ScoredFrame & { timestamp: number }>;
}

interface EvalResult {
  fixture: string;
  passed: boolean;
  assertions: Array<{ name: string; passed: boolean; detail: string }>;
  durationMs: number;
  estimatedCostUSD: number;
  clips: DetectionResult["clips"];
  theme: DetectionResult["detectedTheme"];
  contentSummary: DetectionResult["contentSummary"];
}

function assert(name: string, condition: boolean, detail: string): { name: string; passed: boolean; detail: string } {
  const icon = condition ? "✓" : "✗";
  console.log(`  ${icon} ${name}: ${detail}`);
  return { name, passed: condition, detail };
}

async function runFixture(fixturePath: string): Promise<EvalResult> {
  const raw = readFileSync(fixturePath, "utf8");
  const fixture: EvalFixture = JSON.parse(raw);
  const expected = fixture._expected;

  console.log(`\n── Fixture: ${path.basename(fixturePath)} ──`);
  console.log(`   ${fixture._description}`);
  console.log(`   ${fixture.frames.length} frames, ${fixture.scores.length} scored`);

  const start = Date.now();

  // planFromScores requires "use server" context; call via direct import here (eval context).
  // The function makes a real Anthropic API call — ensure ANTHROPIC_API_KEY is set.
  let result: DetectionResult;
  try {
    result = await planFromScores(
      fixture.frames,
      fixture.scores,
      fixture._templateHint ?? undefined,
      undefined, // userFeedback
      undefined, // creativeDirection
      undefined, // disabledFeatures
      (phase) => { console.log(`   [phase] ${phase}`); }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ planFromScores threw: ${msg}`);
    return {
      fixture: fixturePath,
      passed: false,
      assertions: [{ name: "planFromScores", passed: false, detail: msg }],
      durationMs: Date.now() - start,
      estimatedCostUSD: 0,
      clips: [],
      theme: "cinematic",
      contentSummary: "",
    };
  }

  const durationMs = Date.now() - start;
  const totalClipDuration = result.clips.reduce((sum, c) => sum + (c.endTime - c.startTime), 0);

  // ── Assertions ──
  const assertions = [
    assert(
      "clip count",
      result.clips.length >= expected.minClips && result.clips.length <= expected.maxClips,
      `${result.clips.length} clips (expected ${expected.minClips}–${expected.maxClips})`
    ),
    assert(
      "total clip duration",
      totalClipDuration >= expected.minTotalDurationSec && totalClipDuration <= expected.maxTotalDurationSec,
      `${totalClipDuration.toFixed(1)}s (expected ${expected.minTotalDurationSec}–${expected.maxTotalDurationSec}s)`
    ),
    assert(
      "theme detected",
      expected.acceptableThemes.includes(result.detectedTheme),
      `"${result.detectedTheme}" (acceptable: ${expected.acceptableThemes.join(", ")})`
    ),
    assert(
      "content summary present",
      typeof result.contentSummary === "string" && result.contentSummary.length > 10,
      result.contentSummary ? `"${result.contentSummary.slice(0, 60)}..."` : "(empty)"
    ),
    assert(
      "production plan present",
      !!result.productionPlan,
      result.productionPlan ? "present" : "missing"
    ),
    ...expected.requiredPlanFields.map((field) =>
      assert(
        `plan.${field}`,
        result.productionPlan
          ? field in result.productionPlan && result.productionPlan[field as keyof typeof result.productionPlan] !== undefined
          : false,
        result.productionPlan ? `present` : "plan missing"
      )
    ),
    assert(
      "clips ordered",
      result.clips.every((c, i) => i === 0 || c.order === i + 1 || c.order >= i),
      result.clips.map((c) => c.order).join(", ")
    ),
    assert(
      "no zero-duration clips",
      result.clips.every((c) => c.endTime > c.startTime),
      result.clips.map((c) => `${c.startTime}→${c.endTime}`).join(", ").slice(0, 80)
    ),
  ];

  const passed = assertions.every((a) => a.passed);
  const estimatedCostUSD = 0.07; // ~Sonnet planner cost per run; actual logged by CostMeter above

  console.log(`\n   Result: ${passed ? "PASS ✓" : "FAIL ✗"} in ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`   Theme: ${result.detectedTheme} | Clips: ${result.clips.length} | Total: ${totalClipDuration.toFixed(1)}s`);
  console.log(`   Est. cost: ~$${estimatedCostUSD.toFixed(3)}/run (Sonnet planner + Haiku validation)`);

  return { fixture: fixturePath, passed, assertions, durationMs, estimatedCostUSD, clips: result.clips, theme: result.detectedTheme, contentSummary: result.contentSummary };
}

async function main() {
  console.log("HighlightMagic — Detection Quality Eval");
  console.log("==========================================");
  console.log("NOTE: This makes REAL API calls. Each run costs ~$0.05–$0.20.");
  console.log(`      ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "set ✓" : "MISSING ✗"}\n`);

  // Each eval OWNS a fixtures/<eval>/ subdir; detection fixtures live in fixtures/detection/. This is
  // structural, not a runtime guard: globbing here can only ever see this eval's own fixtures, so a
  // sibling eval's differently-shaped fixture can't be picked up (the actual root cause of the earlier
  // crash — a video-gen fixture sitting in a shared flat dir). Add a *-highlight.json here to include it.
  const fixturesDir = path.join(__dirname, "fixtures", "detection");
  const fixtures = readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(fixturesDir, f));

  const results: EvalResult[] = [];
  for (const fixture of fixtures) {
    results.push(await runFixture(fixture));
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const totalCost = results.reduce((s, r) => s + r.estimatedCostUSD, 0);

  console.log(`\n══════════════════════════════════`);
  console.log(`EVAL SUMMARY: ${passed}/${total} fixtures passed`);
  console.log(`Total est. cost: ~$${totalCost.toFixed(3)}`);
  console.log(`══════════════════════════════════\n`);

  if (passed < total) {
    console.error(`${total - passed} fixture(s) FAILED — see assertions above.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[eval] Unhandled error:", err);
  process.exit(1);
});
