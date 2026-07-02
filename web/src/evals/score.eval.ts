/**
 * Frame-scoring quality eval — ROADMAP G3 rung 2 (real pixels through the REAL vision scorer).
 *
 * GATED — only runs when EVAL_MODE=1. Normal CI never calls this; it spends real Anthropic tokens.
 *   EVAL_MODE=1 ANTHROPIC_API_KEY=sk-ant-... npx tsx web/src/evals/score.eval.ts
 *
 * Unlike detect.eval.ts (which feeds the PLANNER synthetic score fixtures), this feeds the REAL
 * frame scorer (`scoreSingleBatch` → Anthropic vision) actual image PIXELS from committed fixtures
 * and asserts it returns a well-formed score per frame. This is the "real pixels are actually scored
 * by the real model" round-trip — the first rung on real media.
 *
 * Fixtures today are license-free generated JPEGs (see fixtures/media/SOURCES.md); they validate the
 * scoring PLUMBING (real pixels in → valid scores out). Realistic CC0 footage + scoring-QUALITY
 * assertions (does it rank a real highlight above filler?) are the next rung — grow this over time.
 */

if (process.env.EVAL_MODE !== "1") {
  console.error(
    "[eval] This eval is gated. Set EVAL_MODE=1 to run it.\n" +
      "       It makes real Anthropic vision calls and costs a few cents per run.\n" +
      "       Example: EVAL_MODE=1 ANTHROPIC_API_KEY=sk-ant-... npx tsx web/src/evals/score.eval.ts",
  );
  process.exit(1);
}

import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { scoreSingleBatch, type ScoredFrame } from "../actions/detect";

const MEDIA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "media");

// Committed real-pixel JPEG fixtures (license-free generated; see SOURCES.md). Treated as frames of
// one synthetic "video" source at 1s spacing — mirrors how real extracted frames reach the scorer.
const FRAME_FILES = [
  "gen_testpattern_540x960.jpg",
  "gen_gradient_540x960.jpg",
  "gen_mandelbrot_540x960.jpg",
];

const SOURCE_ID = "gen-sample";

function loadFrames() {
  return FRAME_FILES.map((file, i) => ({
    sourceFileId: SOURCE_ID,
    sourceFileName: "generated-sample.mp4",
    sourceType: "video" as const,
    timestamp: i, // 0s, 1s, 2s
    base64: readFileSync(path.join(MEDIA_DIR, file)).toString("base64"),
  }));
}

async function main() {
  console.log("HighlightMagic — Frame Scoring Eval (real pixels → real Anthropic vision scorer)");
  console.log("=================================================================================");
  console.log(`   ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "set ✓" : "MISSING ✗"}`);
  console.log(`   Fixtures: ${FRAME_FILES.length} real JPEG frames from fixtures/media/\n`);

  const batch = loadFrames();
  for (const f of batch) {
    if (!f.base64) throw new Error(`Fixture ${f.timestamp} has empty base64 — real pixels required.`);
  }

  const sourceFiles = [
    { id: SOURCE_ID, name: "generated-sample.mp4", type: "video" as const, frameCount: batch.length },
  ];

  let scores: ScoredFrame[];
  try {
    scores = await scoreSingleBatch(batch, sourceFiles);
  } catch (err) {
    console.error(`  ✗ scoreSingleBatch threw: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Assertions — the REAL round-trip must return a well-formed score per frame.
  const problems: string[] = [];
  if (!Array.isArray(scores) || scores.length === 0) {
    problems.push(`expected a non-empty ScoredFrame[]; got ${JSON.stringify(scores)?.slice(0, 80)}`);
  } else {
    if (scores.length !== batch.length) {
      problems.push(`expected ${batch.length} scores, got ${scores.length}`);
    }
    for (const s of scores) {
      if (typeof s.score !== "number" || !Number.isFinite(s.score) || s.score < 0) {
        problems.push(`frame t=${s.timestamp}: score is not a finite ≥0 number (${s.score})`);
      }
      if (typeof s.label !== "string" || s.label.trim() === "") {
        problems.push(`frame t=${s.timestamp}: empty label`);
      }
      if (s.sourceFileId !== SOURCE_ID) {
        problems.push(`frame t=${s.timestamp}: sourceFileId not preserved (${s.sourceFileId})`);
      }
    }
  }

  for (const s of scores ?? []) {
    console.log(`  frame t=${s.timestamp}s → score ${Number(s.score).toFixed(3)} | "${String(s.label).slice(0, 60)}"`);
  }

  if (problems.length) {
    console.error(`\n  ✗ FAIL — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`     - ${p}`);
    console.log("\n══════════════════════════════════\nSCORE EVAL: FAILED\n══════════════════════════════════");
    process.exit(1);
  }

  console.log("\n  ✓ every real frame got a well-formed score (finite ≥0, non-empty label, source preserved)");
  console.log("\n══════════════════════════════════\nSCORE EVAL: PASS ✓ — real vision round-trip validated\n══════════════════════════════════");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
