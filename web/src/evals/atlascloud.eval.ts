/**
 * AtlasCloud video-generation quality eval — ROADMAP G3 rung 6 (the priciest rung).
 *
 * DOUBLE-GATED — needs BOTH EVAL_MODE=1 and RUN_VIDEO_EVAL=1. This is the expensive rung
 * (~$0.50–1 per image-to-video job), so it is gated separately from the cheap weekly evals and is
 * never triggered by a plain EVAL_MODE run. Normal CI never calls it. Run manually:
 *   EVAL_MODE=1 RUN_VIDEO_EVAL=1 ATLASCLOUD_API_KEY=... npx tsx web/src/evals/atlascloud.eval.ts
 *
 * Before any paid call it estimates the run cost and ABORTS if it would exceed EVAL_MAX_USD
 * (default $1, ROADMAP G3 "PER-RUN CEILING") — a runaway can never rack up unattended spend.
 *
 * Designed to run in the weekly .github/workflows/live-eval.yml once wired there (owner step —
 * the loop cannot edit .github/; see REMAINING_STEPS). Today it is a manual/on-change eval.
 *
 * What it tests: the REAL submit → poll round-trip (generatePhotoAnimation → Kling → hosted MP4 URL)
 * must complete and return a valid, well-formed video URL rather than a stuck/failed prediction. The
 * scoring rubric lives in eval-assertions.ts (checkVideoResult) and is unit-tested in normal CI.
 */

if (process.env.EVAL_MODE !== "1" || process.env.RUN_VIDEO_EVAL !== "1") {
  console.error(
    "[eval] This is the priciest rung and is double-gated. Set BOTH EVAL_MODE=1 and RUN_VIDEO_EVAL=1.\n" +
      "       It makes a real AtlasCloud video-gen call and costs ~$0.50–1 per run.\n" +
      "       Example: EVAL_MODE=1 RUN_VIDEO_EVAL=1 ATLASCLOUD_API_KEY=... npx tsx web/src/evals/atlascloud.eval.ts",
  );
  process.exit(1);
}

import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { generatePhotoAnimation } from "../lib/atlascloud";
import {
  checkVideoResult,
  costCeilingExceeded,
  resolveEvalCostCapUSD,
  type VideoExpected,
  type VideoResultLike,
} from "./eval-assertions";

/** Conservative upper-bound cost of one Kling image-to-video job (see ROADMAP G3 cost governance). */
const EST_COST_PER_JOB_USD = 1.0;

interface VideoFixture {
  _description: string;
  _expected: VideoExpected;
  testCases: Array<{ kind: string; imageFile: string; prompt: string; durationSec: number }>;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(HERE, "fixtures", "atlascloud-video-fixture.json");
const MEDIA_DIR = path.resolve(HERE, "fixtures", "media");

async function main() {
  console.log("HighlightMagic — AtlasCloud Video Eval (real image → hosted MP4 round-trip)");
  console.log("=========================================================================");
  console.log(`   ATLASCLOUD_API_KEY: ${process.env.ATLASCLOUD_API_KEY ? "set ✓" : "MISSING ✗"}\n`);

  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as VideoFixture;

  // PER-RUN COST CEILING (ROADMAP G3) — estimate spend and abort BEFORE any paid call.
  const capUSD = resolveEvalCostCapUSD(process.env.EVAL_MAX_USD);
  const projectedUSD = fixture.testCases.length * EST_COST_PER_JOB_USD;
  const overCap = costCeilingExceeded(projectedUSD, capUSD);
  console.log(`   Projected cost: ~$${projectedUSD.toFixed(2)} (${fixture.testCases.length} job(s)); cap $${capUSD.toFixed(2)}`);
  if (overCap) {
    console.error(`\n[eval] ABORT — ${overCap}\n       Raise EVAL_MAX_USD or shrink the fixture to proceed.`);
    process.exit(1);
  }

  let failures = 0;

  for (const tc of fixture.testCases) {
    const bytes = readFileSync(path.join(MEDIA_DIR, tc.imageFile));
    const imageUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;

    let result: VideoResultLike;
    try {
      const outputUrl = await generatePhotoAnimation(imageUrl, tc.prompt, tc.durationSec);
      result = { status: "completed", outputUrl };
    } catch (err) {
      result = { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }

    const problems = checkVideoResult(result, fixture._expected);
    console.log(`  ${tc.kind} (${tc.imageFile}) → status=${result.status}, url=${result.outputUrl ?? "none"}`);
    if (problems.length) {
      failures++;
      for (const p of problems) console.error(`     - ${p}`);
    }
  }

  if (failures) {
    console.log(`\n══════════════════════════════════\nATLASCLOUD EVAL: FAILED (${failures})\n══════════════════════════════════`);
    process.exit(1);
  }
  console.log("\n  ✓ the generation round-trip produced a real, well-formed video URL");
  console.log("\n══════════════════════════════════\nATLASCLOUD EVAL: PASS ✓\n══════════════════════════════════");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
