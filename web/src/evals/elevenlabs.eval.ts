/**
 * ElevenLabs TTS quality eval — ROADMAP G3 rung: eval breadth beyond Anthropic.
 *
 * GATED — only runs when EVAL_MODE=1. Normal CI never calls this; it spends real ElevenLabs
 * credits (a few short strings, well under a cent per run).
 *   EVAL_MODE=1 ELEVENLABS_API_KEY=... npx tsx web/src/evals/elevenlabs.eval.ts
 *
 * What it tests: the REAL text-to-speech round-trip (generateVoiceover → ElevenLabs → MP3 data URI)
 * for each golden test case must (1) resolve the requested voice character to the expected voice id
 * and (2) return a completed result whose decoded audio clears the fixture's byte/duration bounds.
 * The scoring rubric lives in eval-assertions.ts (checkTtsResult) and is unit-tested in normal CI.
 */

if (process.env.EVAL_MODE !== "1") {
  console.error(
    "[eval] This eval is gated. Set EVAL_MODE=1 to run it.\n" +
      "       It makes real ElevenLabs TTS calls and costs well under a cent per run.\n" +
      "       Example: EVAL_MODE=1 ELEVENLABS_API_KEY=... npx tsx web/src/evals/elevenlabs.eval.ts",
  );
  process.exit(1);
}

import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { generateVoiceover, resolveVoiceId } from "../lib/elevenlabs-tts";
import { checkTtsResult, decodeDataUriByteLength, type TtsExpected } from "./eval-assertions";

interface TtsFixture {
  _description: string;
  _expected: TtsExpected;
  testCases: Array<{ text: string; voiceCharacter: string; expectedVoiceId: string }>;
}

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "elevenlabs-tts-fixture.json",
);

async function main() {
  console.log("HighlightMagic — ElevenLabs TTS Eval (real text → real MP3 round-trip)");
  console.log("======================================================================");
  console.log(`   ELEVENLABS_API_KEY: ${process.env.ELEVENLABS_API_KEY ? "set ✓" : "MISSING ✗"}\n`);

  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as TtsFixture;
  let failures = 0;

  for (const tc of fixture.testCases) {
    // Deterministic, no-cost assertion first: the voice mapping is pure.
    const resolved = resolveVoiceId(tc.voiceCharacter);
    if (resolved !== tc.expectedVoiceId) {
      failures++;
      console.error(
        `  ✗ voice "${tc.voiceCharacter}" resolved to ${resolved}, expected ${tc.expectedVoiceId}`,
      );
    }

    let problems: string[];
    try {
      const result = await generateVoiceover(tc.text, tc.voiceCharacter);
      problems = checkTtsResult(result, fixture._expected);
      const bytes = decodeDataUriByteLength(result.audioUrl);
      console.log(
        `  "${tc.text}" → status=${result.status}, ${bytes} bytes, ${result.duration ?? "?"}s`,
      );
    } catch (err) {
      problems = [`generateVoiceover threw: ${err instanceof Error ? err.message : String(err)}`];
    }

    if (problems.length) {
      failures++;
      for (const p of problems) console.error(`     - ${p}`);
    }
  }

  if (failures) {
    console.log(`\n══════════════════════════════════\nELEVENLABS EVAL: FAILED (${failures})\n══════════════════════════════════`);
    process.exit(1);
  }
  console.log("\n  ✓ every case resolved the right voice and returned real, in-bounds audio");
  console.log("\n══════════════════════════════════\nELEVENLABS EVAL: PASS ✓\n══════════════════════════════════");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
