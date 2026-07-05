/**
 * AtlasCloud video-generation quality eval — ROADMAP G3 rung: eval breadth beyond Anthropic.
 *
 * GATED — only runs when EVAL_MODE=1. Normal CI never calls this; a single image-to-video job
 * spends real AtlasCloud credits (~$0.50–1). Run manually:
 *   EVAL_MODE=1 ATLASCLOUD_API_KEY=... npx tsx web/src/evals/atlascloud.eval.ts
 *
 * What it tests: the REAL submit → poll round-trip (generatePhotoAnimation → Kling → hosted MP4 URL)
 * must complete and return a valid, reachable video URL rather than a stuck/failed prediction. The
 * scoring rubric lives in eval-assertions.ts (checkVideoResult) and is unit-tested in normal CI.
 */

if (process.env.EVAL_MODE !== "1") {
  console.error(
    "[eval] This eval is gated. Set EVAL_MODE=1 to run it.\n" +
      "       It makes a real AtlasCloud video-gen call and costs ~$0.50–1 per run.\n" +
      "       Example: EVAL_MODE=1 ATLASCLOUD_API_KEY=... npx tsx web/src/evals/atlascloud.eval.ts",
  );
  process.exit(1);
}

import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { generatePhotoAnimation } from "../lib/atlascloud";
import { checkVideoResult, type VideoExpected, type VideoResultLike } from "./eval-assertions";

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
  console.log("\n  ✓ the generation round-trip produced a real, reachable video URL");
  console.log("\n══════════════════════════════════\nATLASCLOUD EVAL: PASS ✓\n══════════════════════════════════");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
