/**
 * Pure, side-effect-free assertion helpers shared by the provider round-trip evals
 * (elevenlabs.eval.ts, atlascloud.eval.ts) — ROADMAP G3 rung: eval breadth beyond Anthropic.
 *
 * These functions take a REAL provider response plus the fixture's expected bounds and return a
 * list of human-readable problems (empty === passed). They contain the scoring rubric, so they are
 * unit-tested directly in eval-assertions.test.ts with synthetic pass/fail inputs — the live evals
 * that actually spend provider tokens are gated behind EVAL_MODE=1 and only run in the weekly
 * live-eval workflow, but the RUBRIC they enforce is verified in normal CI here.
 */

/** Shape of an ElevenLabs TTS result (mirrors TtsGenerateResult in lib/elevenlabs-tts.ts). */
export interface TtsResultLike {
  status: "completed" | "failed";
  audioUrl?: string;
  duration?: number;
  error?: string;
}

export interface TtsExpected {
  /** Minimum decoded audio byte count — below this the response is effectively empty. */
  minAudioBytes: number;
  /** Optional upper bound — a wildly oversized payload signals a garbage/error response. */
  maxAudioBytes?: number;
  /** Minimum plausible spoken duration in seconds. */
  minDurationSec: number;
}

/** Shape of an AtlasCloud video poll result (mirrors TaskPollResult in lib/atlascloud.ts). */
export interface VideoResultLike {
  status: "processing" | "completed" | "failed";
  outputUrl?: string;
  error?: string;
}

export interface VideoExpected {
  /** Accepted URL schemes for the produced video (defaults to http/https). */
  acceptableSchemes?: string[];
}

/**
 * Decode the byte length of a base64 `data:` URI without materialising the bytes as a string.
 * Returns 0 for anything that is not a base64 data URI (so callers can assert a positive size).
 */
export function decodeDataUriByteLength(dataUri: string | undefined): number {
  if (typeof dataUri !== "string" || !dataUri.startsWith("data:")) return 0;
  const marker = ";base64,";
  const idx = dataUri.indexOf(marker);
  if (idx === -1) return 0;
  const b64 = dataUri.slice(idx + marker.length);
  if (b64.length === 0) return 0;
  try {
    return Buffer.from(b64, "base64").length;
  } catch {
    return 0;
  }
}

/**
 * Score a real ElevenLabs TTS round-trip against the fixture's expected bounds.
 * Returns an empty array on success, or a list of specific problems.
 */
export function checkTtsResult(result: TtsResultLike, expected: TtsExpected): string[] {
  const problems: string[] = [];

  if (result.status !== "completed") {
    problems.push(`status is "${result.status}" (expected "completed"); error=${result.error ?? "none"}`);
    // A failed generation has no audio to inspect — report and stop here.
    return problems;
  }

  if (typeof result.audioUrl !== "string" || result.audioUrl.length === 0) {
    problems.push("audioUrl is missing on a completed result");
  } else if (!result.audioUrl.startsWith("data:audio")) {
    problems.push(`audioUrl is not an audio data URI (got "${result.audioUrl.slice(0, 24)}…")`);
  }

  const bytes = decodeDataUriByteLength(result.audioUrl);
  if (bytes < expected.minAudioBytes) {
    problems.push(`audio is ${bytes} bytes, below the ${expected.minAudioBytes}-byte floor (empty/truncated?)`);
  }
  if (expected.maxAudioBytes !== undefined && bytes > expected.maxAudioBytes) {
    problems.push(`audio is ${bytes} bytes, above the ${expected.maxAudioBytes}-byte ceiling (garbage response?)`);
  }

  if (typeof result.duration !== "number" || !Number.isFinite(result.duration) || result.duration <= 0) {
    problems.push(`duration is not a finite positive number (${result.duration})`);
  } else if (result.duration < expected.minDurationSec) {
    problems.push(`duration ${result.duration}s is below the ${expected.minDurationSec}s floor`);
  }

  return problems;
}

/**
 * Score a real AtlasCloud video-generation round-trip against the fixture's expected bounds.
 * Returns an empty array on success, or a list of specific problems.
 */
export function checkVideoResult(result: VideoResultLike, expected: VideoExpected = {}): string[] {
  const problems: string[] = [];
  const schemes = expected.acceptableSchemes ?? ["http:", "https:"];

  if (result.status !== "completed") {
    problems.push(`status is "${result.status}" (expected "completed"); error=${result.error ?? "none"}`);
    return problems;
  }

  if (typeof result.outputUrl !== "string" || result.outputUrl.length === 0) {
    problems.push("outputUrl is missing on a completed result");
    return problems;
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(result.outputUrl);
  } catch {
    problems.push(`outputUrl is not a valid URL (got "${result.outputUrl.slice(0, 40)}…")`);
  }
  if (parsed && !schemes.includes(parsed.protocol)) {
    problems.push(`outputUrl scheme "${parsed.protocol}" is not one of ${schemes.join(", ")}`);
  }

  return problems;
}
