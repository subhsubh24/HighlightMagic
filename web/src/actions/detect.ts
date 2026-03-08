"use server";

import { MAX_FRAMES_PER_BATCH } from "@/lib/constants";
import type { SourceFileInfo } from "@/lib/frame-batching";

// ── Debug logging ──

const DEBUG = process.env.NODE_ENV === "development" || process.env.DEBUG_DETECT === "1";
/** Debug-only logger — gated behind NODE_ENV or DEBUG_DETECT flag to avoid production noise. */
function debugLog(...args: unknown[]) {
  if (DEBUG) console.log(...args);
}

// ── API helpers ──

/** Max concurrent API calls — retry logic handles any 429s from the API */
const MAX_CONCURRENCY = 5;

/** Stagger delay between launching concurrent batches (ms).
 *  Prevents all workers from hitting the API at t=0, which triggers 429s. */
const BATCH_STAGGER_MS = 500;

/** Retry config for 429/529 responses */
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2000;
/** Cap Retry-After waits — staggered launches prevent most 429s now */
const MAX_RETRY_WAIT_MS = 15_000;

/**
 * Fetch with retry + exponential backoff for rate limits (429) and overload (529).
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs?: number
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const fetchInit = timeoutMs
        ? { ...init, signal: AbortSignal.timeout(timeoutMs) }
        : init;
      const response = await fetch(url, fetchInit);
      if (response.ok) return response;

      // Only retry on rate-limit (429) or overloaded (529)
      if (response.status === 429 || response.status === 529) {
        // Use Retry-After header if available, else exponential backoff — capped to avoid absurd waits
        const retryAfter = response.headers.get("retry-after");
        const retryAfterSec = retryAfter ? parseFloat(retryAfter) : NaN;
        const rawWaitMs = !isNaN(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec * 1000
          : INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        const waitMs = Math.min(rawWaitMs, MAX_RETRY_WAIT_MS);
        console.warn(`${label}: ${response.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(waitMs)}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      // Non-retryable HTTP error — return as-is
      return response;
    } catch (err) {
      // Retry on timeout and network errors (transient failures)
      if (attempt < MAX_RETRIES) {
        const waitMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(`${label}: ${err instanceof Error ? err.message : "network error"}, retry ${attempt + 1}/${MAX_RETRIES} in ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  // All retries exhausted — make one final attempt (will throw on failure)
  const fetchInit = timeoutMs
    ? { ...init, signal: AbortSignal.timeout(timeoutMs) }
    : init;
  return fetch(url, fetchInit);
}

/**
 * Run async tasks with a concurrency limit.
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const idx = next++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── SSE stream consumer (for streaming API responses) ──

/**
 * Consume an SSE (Server-Sent Events) stream from the Anthropic Messages API.
 * Accumulates text content from text_delta events and captures the stop_reason.
 * Thinking blocks are silently skipped — we only need the final text output.
 */
/**
 * SSE stream phase — used to report progress to callers.
 * - "thinking": model is in extended thinking phase
 * - "generating": model is producing text output (usually near the end)
 */
type SSEStreamPhase = "thinking" | "generating";

/** Max time (ms) to wait for the next SSE chunk before treating the stream as stalled. */
const STREAM_READ_TIMEOUT_MS = 90_000; // 90s — generous for Opus thinking pauses

/** Callback for early production plan fields extracted during streaming. */
type OnPartialField = (field: string, value: unknown) => void;

/**
 * Try to extract complete JSON string/number/object/array fields from partial
 * streaming text. Used to start generators early (e.g., start music generation
 * as soon as musicPrompt is fully streamed, before the full plan finishes).
 */
const PARTIAL_FIELD_COUNT = 3; // musicPrompt, musicDurationMs, sfx

function extractPartialFields(text: string, emitted: Set<string>, onPartial: OnPartialField): void {
  // All trackable fields already emitted — nothing left to do
  if (emitted.size >= PARTIAL_FIELD_COUNT) return;

  // musicPrompt — a simple string field
  if (!emitted.has("musicPrompt")) {
    const m = text.match(/"musicPrompt"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) {
      emitted.add("musicPrompt");
      onPartial("musicPrompt", m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
      debugLog(`[Planner SSE] Early extract: musicPrompt`);
    }
  }

  // musicDurationMs — a number field
  if (!emitted.has("musicDurationMs")) {
    const m = text.match(/"musicDurationMs"\s*:\s*(\d+)/);
    if (m) {
      emitted.add("musicDurationMs");
      onPartial("musicDurationMs", parseInt(m[1], 10));
      debugLog(`[Planner SSE] Early extract: musicDurationMs`);
    }
  }

  // sfx — array of objects. Wait until the array closes.
  if (!emitted.has("sfx")) {
    const sfxStart = text.indexOf('"sfx"');
    if (sfxStart !== -1) {
      const bracketStart = text.indexOf('[', sfxStart);
      if (bracketStart !== -1) {
        // Find matching close bracket — skip characters inside JSON strings
        // to avoid being fooled by brackets in prompt text
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = bracketStart; i < text.length; i++) {
          const ch = text[i];
          if (escaped) { escaped = false; continue; }
          if (ch === '\\') { escaped = true; continue; }
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (ch === '[') depth++;
          else if (ch === ']') depth--;
          if (depth === 0) {
            // Complete array
            try {
              const arr = JSON.parse(text.slice(bracketStart, i + 1));
              emitted.add("sfx");
              onPartial("sfx", arr);
              debugLog(`[Planner SSE] Early extract: sfx (${arr.length} items)`);
            } catch { /* incomplete JSON — wait */ }
            break;
          }
        }
      }
    }
  }
}

async function consumeSSEStream(
  response: Response,
  onPhase?: (phase: SSEStreamPhase) => void,
  onPartial?: OnPartialField
): Promise<{ text: string; stopReason: string | null }> {
  const streamStartMs = Date.now();
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let stopReason: string | null = null;
  let buffer = "";
  let chunkCount = 0;
  let lastLogMs = Date.now();
  const emittedFields = new Set<string>();

  while (true) {
    // Race the read against a timeout so we don't hang forever if the
    // Anthropic stream stalls mid-response.
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Planner stream stalled — no data received for 90 seconds")), STREAM_READ_TIMEOUT_MS);
    });
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await Promise.race([reader.read(), timeout]);
    } finally {
      clearTimeout(timer!);
    }
    const { done, value } = result;
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete lines
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // Keep incomplete last line in buffer

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const dataStr = line.slice(6).trim();
      if (dataStr === "[DONE]") continue;

      try {
        const event = JSON.parse(dataStr);
        if (event.type === "content_block_start") {
          if (event.content_block?.type === "thinking") {
            debugLog(`[Planner SSE] Thinking phase started (+${((Date.now() - streamStartMs) / 1000).toFixed(1)}s)`);
            onPhase?.("thinking");
          } else if (event.content_block?.type === "text") {
            debugLog(`[Planner SSE] Text generation started (+${((Date.now() - streamStartMs) / 1000).toFixed(1)}s)`);
            onPhase?.("generating");
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta?.type === "text_delta") {
            text += event.delta.text;
            // Try to extract partial fields for early generator start
            if (onPartial) {
              extractPartialFields(text, emittedFields, onPartial);
            }
          }
          chunkCount++;
          // Log every 15s so we know the stream is alive
          if (Date.now() - lastLogMs > 15_000) {
            debugLog(`[Planner SSE] Still streaming... chunks=${chunkCount}, textLen=${text.length}, +${((Date.now() - streamStartMs) / 1000).toFixed(0)}s`);
            lastLogMs = Date.now();
          }
        } else if (event.type === "message_delta") {
          stopReason = event.delta?.stop_reason ?? null;
        } else if (event.type === "error") {
          console.error(`[Planner SSE] Stream error event:`, JSON.stringify(event));
        }
      } catch {
        // Ignore unparseable SSE events (e.g. event: prefixes)
      }
    }
  }

  debugLog(`[Planner SSE] Stream complete — ${chunkCount} chunks, ${text.length} chars, stop_reason=${stopReason}, ${((Date.now() - streamStartMs) / 1000).toFixed(1)}s total`);
  return { text, stopReason };
}

// ── JSON parsing helpers ──

/**
 * Safely parse a JSON array string from an AI response.
 * AI models sometimes produce invalid JSON with:
 * - Trailing commas before ] or }
 * - Unescaped control characters (newlines, tabs) inside strings
 * - Unescaped quotes inside string values
 *
 * This function attempts progressively aggressive sanitization.
 */
function safeParseJSONArray(raw: string): unknown {
  // Attempt 1: direct parse
  try {
    return JSON.parse(raw);
  } catch {
    // fall through
  }

  // Attempt 2: fix trailing commas and control characters
  let sanitized = raw
    // Remove trailing commas before } or ]
    .replace(/,\s*([}\]])/g, "$1")
    // Replace unescaped newlines/tabs inside strings with spaces
    .replace(/(?<=":[ ]*"[^"]*)\n/g, " ")
    .replace(/(?<=":[ ]*"[^"]*)\t/g, " ");

  try {
    return JSON.parse(sanitized);
  } catch {
    // fall through
  }

  // Attempt 3: extract individual objects and rebuild array
  // This handles cases where the label contains unescaped quotes
  try {
    const objects: unknown[] = [];
    // Match each object boundary by looking for {"index": patterns
    const objRegex = /\{\s*"index"\s*:\s*(\d+)\s*,\s*"score"\s*:\s*([\d.]+)\s*,\s*"role"\s*:\s*"([^"]*?)"\s*,\s*"label"\s*:\s*"([\s\S]*?)"\s*\}/g;
    let match: RegExpExecArray | null;
    while ((match = objRegex.exec(sanitized)) !== null) {
      objects.push({
        index: parseInt(match[1]),
        score: parseFloat(match[2]),
        role: match[3],
        label: match[4].replace(/"/g, "'").replace(/\n/g, " "),
      });
    }
    // Try alternate key order: index, score, label, role
    if (objects.length === 0) {
      const altRegex = /\{\s*"index"\s*:\s*(\d+)\s*,\s*"score"\s*:\s*([\d.]+)\s*,\s*"label"\s*:\s*"([\s\S]*?)"\s*,\s*"role"\s*:\s*"([^"]*?)"\s*\}/g;
      while ((match = altRegex.exec(sanitized)) !== null) {
        objects.push({
          index: parseInt(match[1]),
          score: parseFloat(match[2]),
          label: match[3].replace(/"/g, "'").replace(/\n/g, " "),
          role: match[4],
        });
      }
    }
    if (objects.length > 0) {
      console.warn(`Scoring: recovered ${objects.length} frames via regex extraction after JSON.parse failure`);
      return objects;
    }
  } catch {
    // fall through
  }

  // Final attempt: strip everything outside [] and retry
  try {
    const bracketMatch = sanitized.match(/\[[\s\S]*\]/);
    if (bracketMatch) {
      sanitized = bracketMatch[0]
        .replace(/,\s*\]/g, "]")
        .replace(/,\s*\}/g, "}");
      return JSON.parse(sanitized);
    }
  } catch {
    // fall through
  }

  throw new SyntaxError(`Failed to parse scoring JSON after all sanitization attempts: ${raw.slice(0, 200)}`);
}

// ── Types ──

interface MultiFrameInput {
  sourceFileId: string;
  sourceFileName: string;
  sourceType: "video" | "photo";
  timestamp: number;
  base64: string;
  audioEnergy?: number; // 0.0-1.0 normalized RMS energy at this timestamp
  audioOnset?: number;  // 0.0-1.0 energy delta — transient/beat strength
  audioBass?: number;   // 0.0-1.0 energy ratio in bass band (20-300 Hz)
  audioMid?: number;    // 0.0-1.0 energy ratio in voice band (300-2000 Hz)
  audioTreble?: number; // 0.0-1.0 energy ratio in treble band (2000-8000 Hz)
}

export interface ScoredFrame {
  sourceFileId: string;
  sourceType: "video" | "photo";
  timestamp: number;
  score: number;
  label: string;
  narrativeRole?: string; // HOOK | HERO | REACTION | RHYTHM | CLOSER
}

export type DetectedTheme =
  | "sports"
  | "cooking"
  | "travel"
  | "gaming"
  | "party"
  | "fitness"
  | "pets"
  | "vlog"
  | "wedding"
  | "cinematic";

export interface DetectedClip {
  id: string;
  sourceFileId: string;
  startTime: number;
  endTime: number;
  confidenceScore: number;
  label: string;
  velocityPreset: string;
  order: number;
  // Per-clip visual style (AI-decided)
  transitionType?: string;
  transitionDuration?: number;
  filter?: string;
  captionText?: string;
  captionStyle?: string;
  entryPunchScale?: number;
  entryPunchDuration?: number;
  kenBurnsIntensity?: number;
  // Dynamic AI-authored styles
  customVelocityKeyframes?: Array<{ position: number; speed: number }>;
  customFilterCSS?: string;
  // Dynamic AI-authored caption styling
  customCaptionFontWeight?: number;
  customCaptionFontStyle?: string;
  customCaptionFontFamily?: string;
  customCaptionColor?: string;
  customCaptionAnimation?: string;
  customCaptionGlowColor?: string;
  customCaptionGlowRadius?: number;
  // Photo animation — AI-generated motion prompt for Kling
  animationPrompt?: string;
}

export interface ProductionPlan {
  intro: { text: string; stylePrompt: string; duration: number } | null;
  outro: { text: string; stylePrompt: string; duration: number } | null;
  sfx: Array<{ clipIndex: number; timing: string; prompt: string; durationMs: number }>;
  voiceover: { enabled: boolean; segments: Array<{ clipIndex: number; text: string }>; voiceCharacter: string; delaySec: number };
  musicPrompt: string;
  musicDurationMs: number;
  musicVolume: number;
  sfxVolume: number;
  voiceoverVolume: number;
  defaultTransitionDuration: number;
  thumbnail: { sourceClipIndex: number; frameTime: number; stylePrompt: string } | null;
  styleTransfer: { prompt: string; strength: number } | null;
  talkingHeadSpeech: string | null;
}

export interface DetectionResult {
  clips: DetectedClip[];
  detectedTheme: DetectedTheme;
  contentSummary: string;
  /** AI production plan — drives SFX, voiceover, intro/outro, music, and thumbnail generation */
  productionPlan?: ProductionPlan;
}

// ── Helpers ──

function buildSourceFilesMap(frames: MultiFrameInput[]): Map<string, { name: string; type: "video" | "photo"; frameCount: number }> {
  const sourceFiles = new Map<string, { name: string; type: "video" | "photo"; frameCount: number }>();
  for (const f of frames) {
    if (!sourceFiles.has(f.sourceFileId)) {
      sourceFiles.set(f.sourceFileId, { name: f.sourceFileName, type: f.sourceType, frameCount: 0 });
    }
    sourceFiles.get(f.sourceFileId)!.frameCount++;
  }
  return sourceFiles;
}

// ── Phase 1: Score all frames ──

/**
 * Score a single batch of frames. Called from the client per-batch
 * so each server action completes in <60s (well within timeout).
 */
export async function scoreSingleBatch(
  batch: MultiFrameInput[],
  sourceFileList: SourceFileInfo[],
  templateName?: string
): Promise<ScoredFrame[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured. AI analysis requires a valid API key.");
  }
  const sourceFiles = new Map(sourceFileList.map((s) => [s.id, { name: s.name, type: s.type, frameCount: s.frameCount }]));
  return analyzeMultiBatch(apiKey, batch, sourceFiles, templateName);
}


// ── Score normalization across batches ──

/**
 * Normalize scores so different scoring batches are comparable.
 * Each batch may have a different mean/variance due to context differences.
 * We z-score normalize within each batch-sized group (by source),
 * then rescale to [0, 1].
 */
function normalizeScoresAcrossBatches(scores: ScoredFrame[]): ScoredFrame[] {
  if (scores.length === 0) return scores;

  // Group by source (each source was batched separately)
  const bySource = new Map<string, ScoredFrame[]>();
  for (const s of scores) {
    if (!bySource.has(s.sourceFileId)) bySource.set(s.sourceFileId, []);
    bySource.get(s.sourceFileId)!.push(s);
  }

  // Z-score normalize within each source group
  const zScores = new Map<ScoredFrame, number>();
  for (const [, group] of bySource) {
    const mean = group.reduce((sum, s) => sum + s.score, 0) / group.length;
    const variance = group.reduce((sum, s) => sum + (s.score - mean) ** 2, 0) / group.length;
    const stdDev = Math.sqrt(variance);

    for (const s of group) {
      // If all scores are identical (stdDev=0), treat as average (z=0)
      zScores.set(s, stdDev > 0.001 ? (s.score - mean) / stdDev : 0);
    }
  }

  // Rescale z-scores to [0, 1] using min-max across all sources
  let minZ = Infinity, maxZ = -Infinity;
  for (const z of zScores.values()) {
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const range = maxZ - minZ;

  return scores.map((s) => ({
    ...s,
    score: Math.max(0, Math.min(1, range > 0.001 ? (zScores.get(s)! - minZ) / range : 0.5)),
  }));
}

// ── Phase 2: Plan highlights from scores ──

/** Info about which photos should be animated (passed from upload step). */
export interface PhotoAnimationInfo {
  sourceFileId: string;
  animatePhoto: boolean;
  animationInstructions: string;
}

export async function planFromScores(
  frames: MultiFrameInput[],
  scores: ScoredFrame[],
  templateName?: string,
  userFeedback?: string,
  creativeDirection?: string,
  onPhase?: (phase: "thinking" | "generating") => void,
  photoAnimations?: PhotoAnimationInfo[],
  onPartial?: OnPartialField
): Promise<DetectionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured. AI analysis requires a valid API key.");
  }

  // Normalize scores across batches so different batch contexts don't skew selection
  const normalizedScores = normalizeScoresAcrossBatches(scores);

  const sourceFiles = buildSourceFilesMap(frames);

  // Single attempt — Opus with effort:max can take 2-3+ minutes.
  // Retrying would compound the wait and cause client-side "Failed to fetch" timeouts.
  const result = await planHighlightTape(apiKey, normalizedScores, frames, sourceFiles, templateName, userFeedback, creativeDirection, onPhase, photoAnimations, onPartial);

  if (result.clips.length === 0) {
    throw new Error(
      `AI planner returned 0 clips (scores: ${scores.length} frames from ${sourceFiles.size} sources). Please try again.`
    );
  }

  return result;
}

// ── Phase 3: Validate assembled tape (Haiku QA) ──

export interface TapeValidationResult {
  passed: boolean;
  issues: string[];
  suggestions: string[];
}

/**
 * Haiku reviews the assembled tape and checks for quality issues.
 * Fast and cheap — acts as a QA gate before showing results to user.
 *
 * Checks: narrative coherence, animation fit, pacing, transition logic,
 * source coverage, hook quality, and cross-source connections.
 */
export async function validateTape(
  clips: DetectedClip[],
  sourceFiles: Array<{ id: string; name: string; type: "video" | "photo" }>,
  contentSummary: string,
  animatedFileIds: string[],
): Promise<TapeValidationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const clipSummaries = clips.map((c, i) => {
    const src = sourceFiles.find((s) => s.id === c.sourceFileId);
    const isAnimated = animatedFileIds.includes(c.sourceFileId);
    return `  ${i + 1}. [${src?.type ?? "?"}${isAnimated ? " ANIMATED" : ""}] "${c.label}" from "${src?.name}" (${c.startTime.toFixed(1)}-${c.endTime.toFixed(1)}s, confidence: ${c.confidenceScore}) transition: ${c.transitionType ?? "none"}, velocity: ${c.velocityPreset}${c.captionText ? `, caption: "${c.captionText}"` : ""}${c.animationPrompt ? `, animationPrompt: "${c.animationPrompt.slice(0, 80)}..."` : ""}`;
  }).join("\n");

  const allSourceIds = new Set(sourceFiles.map((s) => s.id));
  const coveredSourceIds = new Set(clips.map((c) => c.sourceFileId));
  const missingSources = sourceFiles.filter((s) => !coveredSourceIds.has(s.id));

  const prompt = `You are a quality assurance reviewer for Instagram Reels highlight tapes.
You've been given the final assembled tape — clips in order with all editing decisions made.
Some photos have been animated into 5-second videos via Kling (marked [ANIMATED]).

Your job: review the tape for issues that would hurt engagement or feel jarring.

CONTENT SUMMARY:
${contentSummary}

SOURCE FILES (${sourceFiles.length} total):
${sourceFiles.map((s) => `  - "${s.name}" (${s.type}${animatedFileIds.includes(s.id) ? ", will be animated" : ""})`).join("\n")}

ASSEMBLED TAPE (${clips.length} clips):
${clipSummaries}

${missingSources.length > 0 ? `\nWARNING: These sources have NO clips: ${missingSources.map((s) => `"${s.name}"`).join(", ")}` : ""}

CHECK THESE (answer each yes/no, flag issues):
1. HOOK QUALITY: Is clip 1 truly the strongest opening? Would it stop a scroll?
2. PACING: Does energy oscillate properly? Any dead stretches or monotonous runs?
3. TRANSITIONS: Do transition types match the energy change between clips? (e.g., no "zoom_punch" between two slow dreamy clips)
4. SOURCE COVERAGE: Does every source file appear at least once?
5. ANIMATION FIT: For animated photos — do their animation prompts match the narrative arc? Would the motion feel natural in context?
6. NARRATIVE ARC: Does the tape tell a coherent story? Is there build-up, climax, and resolution?
7. CAPTION QUALITY: Are captions punchy, varied, and well-placed? No cliché or redundant captions?

Respond with ONLY a JSON object:
{
  "passed": true/false,
  "issues": ["specific issue 1", "specific issue 2"],
  "suggestions": ["specific actionable fix 1", "specific actionable fix 2"]
}

Rules:
- PASS if the tape is good enough to post. Minor imperfections are fine.
- FAIL only for real problems: missing sources, jarring transitions, weak hook, broken pacing, animation prompts that contradict the mood.
- Be specific in issues/suggestions — reference clip numbers and names.
- Max 5 issues, max 5 suggestions. Empty arrays if none.`;

  const response = await fetchWithRetry(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    },
    "Tape validation",
    30_000 // 30s timeout — Haiku is fast
  );

  if (!response.ok) {
    console.warn("Tape validation failed (non-blocking):", response.status);
    // Non-blocking — if validation fails, just pass
    return { passed: true, issues: [], suggestions: [] };
  }

  const body = await response.json();
  const text = body.content?.[0]?.text ?? "";

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn("Tape validation: no JSON in response");
    return { passed: true, issues: [], suggestions: [] };
  }

  try {
    const result = JSON.parse(jsonMatch[0]);
    return {
      passed: !!result.passed,
      issues: Array.isArray(result.issues) ? result.issues.slice(0, 5) : [],
      suggestions: Array.isArray(result.suggestions) ? result.suggestions.slice(0, 5) : [],
    };
  } catch {
    console.warn("Tape validation: JSON parse error");
    return { passed: true, issues: [], suggestions: [] };
  }
}

/** Max batch-level retries (on top of HTTP-level retry in fetchWithRetry) */
const MAX_BATCH_RETRIES = 2;

const VALID_ROLES = ["HOOK", "HERO", "REACTION", "RHYTHM", "CLOSER"];

/** The raw scoring prompt text — extracted so it's shared between real-time and Batch API. */
function buildScoringPromptBody(sourceList: string, sourceCount: number, templateName?: string): string {
  return `You are a world-class Instagram Reels editor whose content averages 2M+ views.
You understand the PSYCHOLOGY of scrolling — what makes a thumb stop, what makes someone save,
what makes them share to their story, what makes them comment.

You're reviewing raw footage from ${sourceCount} source files. Your job: deeply analyze
every single frame through the lens of INSTAGRAM VIRALITY.

SOURCE FILES:
${sourceList}

FOR EVERY FRAME, evaluate these 6 VIRALITY DIMENSIONS:

1. SCROLL-STOP POWER — Would this freeze someone's thumb mid-scroll in the first 0.3 seconds?
   (High contrast, unexpected visuals, faces with intense emotion, dramatic scale, motion at peak)

2. EMOTIONAL INTENSITY — Does this hit you in the gut? The algorithm rewards watch-time,
   and emotion is what keeps eyeballs locked. (Joy, shock, awe, pride, tenderness, humor, tension)

3. SHAREABILITY — Would someone screenshot this or send it to a friend? "OMG LOOK AT THIS"
   moments. (Impressive feats, beautiful compositions, funny/unexpected, relatable reactions)

4. SAVE POTENTIAL — Would someone hit the bookmark? Saves are weighted HIGHEST by the
   Instagram algorithm. (Aspirational moments, beautiful visuals, tutorial-worthy technique,
   emotional peaks worth rewatching)

5. VISUAL PUNCH — How does this look on a 6-inch phone screen at half-brightness on a bus?
   Instagram is consumed on mobile. (High contrast > subtle, saturated > muted, close-up > wide,
   clean composition > cluttered, faces > landscapes at small scale)

6. NARRATIVE ROLE — How would this serve a viral reel? Think about its FUNCTION:
   - HOOK: Could open the reel and stop scrolling
   - HERO: The main event, the peak moment, what the reel is "about"
   - REACTION: A face/moment that amplifies a hero moment via juxtaposition
   - RHYTHM: A transition beat, texture, pacing control
   - CLOSER: Could end the reel and trigger a replay/loop

7. AUDIO INTELLIGENCE — Each frame has TWO audio signals:
   audioEnergy (0.0-1.0) = volume/loudness at this moment:
   - High (0.7+) = loud (crowd cheering, bass drop, impact, laughter)
   - Medium (0.3-0.7) = moderate (conversation, ambient music, movement)
   - Low (0.0-0.3) = quiet (silence, calm, anticipation, whispers)

   audioOnset (0.0-1.0) = how much the audio CHANGED — transient/beat detection:
   - High onset (0.5+) = something just HAPPENED (beat hit, impact, clap, sudden sound, bass drop)
   - This is the most important audio signal for editing — onsets are natural CUT POINTS.
   - High onset + high energy = definitive beat/impact moment (perfect for flash transitions, velocity hits)
   - High onset + low energy = the start of something (voice beginning, subtle sound emerging)
   - Low onset + high energy = sustained loudness (crowd noise, continuous music — not a cut point)
   Audio onset is what pro editors use to sync cuts to music. When you see a high onset, that's
   where a transition or speed change should land.

   FREQUENCY BANDS — What KIND of audio is happening (when available):
   audioBass (0.0-1.0): proportion of energy in bass (20-300 Hz) — drums, bass guitar, sub-bass
   audioMid (0.0-1.0): proportion of energy in voice band (300-2000 Hz) — speech, vocals, melody
   audioTreble (0.0-1.0): proportion of energy in treble (2000-8000 Hz) — cymbals, sibilants, brightness
   These ratios sum to ~1.0. Use them to identify what's happening sonically:
   - Mid-dominant (audioMid > 0.5): Likely SPEECH — someone talking, narrating, reacting
   - Bass-dominant (audioBass > 0.4) + onset peaks: Likely MUSIC with strong beat / bass drop
   - Broad spectrum (all bands 0.2-0.5): Full mix — music with vocals, rich soundscape
   - Treble-heavy (audioTreble > 0.4): Bright sounds — cymbals, crowd hiss, sharp transients
   Factor this into your label — note "speech detected" or "bass-heavy beat" when relevant.

8. TEMPORAL DYNAMICS — Where does this frame sit in the moment's arc?
   This is what separates editors who find moments from editors who FEEL them.
   - Is this the PEAK of the action, or the wind-up just BEFORE impact?
   - Is energy RISING (anticipation/approach), PEAKING (climax/impact), or FALLING (aftermath/reaction)?
   - Peak moments are rare and precious — the ball hitting the net, the first bite, the jump's apex.
   - Wind-up frames create tension that makes peaks DEVASTATING (the arm pulling back before the throw).
   - Aftermath frames capture raw reaction (the face 0.5s after the surprise, the crowd erupting).
   - Compare each frame to its neighbors in the timeline — is energy building or releasing?

Score each frame 0.0-1.0 based on OVERALL VIRALITY (weighing all 8 dimensions):
- 0.85-1.0: VIRAL POTENTIAL — this frame alone could carry a reel. Scroll-stopping,
  emotionally loaded, share-worthy. Peak action, raw genuine emotion, stunning composition,
  dramatic lighting, unexpected beauty, decisive moments, perfect timing.
- 0.65-0.84: STRONG BEAT — compelling enough to hold attention in a well-edited sequence.
  Good energy, interesting composition, narrative contribution. Supporting moments that
  make the hero shots hit harder by contrast.
- 0.35-0.64: USABLE — generic energy but potentially valuable as a quick beat, reaction
  cutaway, or pacing change. Context-dependent value.
- 0.0-0.34: DEAD WEIGHT — black frames, extreme blur, obstructed lens, test footage,
  nothing visually or emotionally redeemable.

LABEL INSTRUCTIONS — This is CRITICAL. Your label is the planner's EYES.

The tape planner will read your labels to understand the footage WITHOUT seeing the images.
Your label must capture FIVE things in one vivid sentence:
1. WHAT's in the frame (specific, cinematic description)
2. MOTION — what's moving and how (camera panning, subject mid-leap, static close-up, slow drift)
3. ENERGY ARC — is this a build-up, peak, or aftermath? (approaching impact / at the apex / reacting after)
4. WHY it's viral (the emotional/visual hook)
5. HOW it could be used (its narrative role + suggested speed treatment)

NOT: "people dancing" → YES: "group mid-air jumping in sync under pink strobes, confetti frozen at apex — PEAK energy, share-worthy spectacle, hero shot begging for bullet slow-mo"
NOT: "food on plate" → YES: "golden-crusted salmon, steam curl drifting up under warm pendant, camera slowly pushing in — RISING beauty, save-worthy food porn, could open the tape with ramp_out into the detail"
NOT: "person smiling" → YES: "genuine shocked reaction 0.5s after reveal, mouth open eyes wide, completely still — AFTERMATH energy, golden-hour backlight, perfect reaction beat to hard-cut after a hero moment"
${templateName ? `\nStyle context: ${templateName} template` : ""}

Respond with ONLY a JSON array:
[{"index": 0, "score": 0.85, "role": "HERO", "label": "vivid description + viral reason + narrative role"}]

The "role" field must be one of: HOOK, HERO, REACTION, RHYTHM, CLOSER.
Pick the BEST fit for each frame — what role would this moment play in a viral reel?`;
}

/** Build the scoring system prompt — shared between real-time and Batch API paths. */
function buildScoringSystemPrompt(
  sourceFiles: Map<string, { name: string; type: "video" | "photo"; frameCount: number }>,
  templateName?: string
): string {
  const sourceList = Array.from(sourceFiles.entries())
    .map(([id, info]) => `- "${info.name}" (${info.type}, ID: ${id})`)
    .join("\n");
  return buildScoringPromptBody(sourceList, sourceFiles.size, templateName);
}

/** Build the user-content array for a scoring batch — shared between real-time and Batch API. */
function buildScoringContent(
  batch: MultiFrameInput[]
): Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }> {
  const content: Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }> = [];
  batch.forEach((frame, i) => {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: frame.base64 },
    });
    const audioTag = frame.audioEnergy != null
      ? `, audioEnergy: ${frame.audioEnergy.toFixed(2)}`
      : "";
    const onsetTag = frame.audioOnset != null && frame.audioOnset > 0.1
      ? `, audioOnset: ${frame.audioOnset.toFixed(2)}`
      : "";
    const specTag = (frame.audioBass != null && frame.audioEnergy != null && frame.audioEnergy > 0.1)
      ? `, spectrum: B${(frame.audioBass ?? 0).toFixed(2)}/M${(frame.audioMid ?? 0).toFixed(2)}/T${(frame.audioTreble ?? 0).toFixed(2)}`
      : "";
    content.push({
      type: "text",
      text: `Frame ${i} — source: "${frame.sourceFileName}" (${frame.sourceType}), fileID: ${frame.sourceFileId}, timestamp: ${frame.timestamp.toFixed(1)}s${audioTag}${onsetTag}${specTag}`,
    });
  });
  return content;
}

async function analyzeMultiBatch(
  apiKey: string,
  batch: MultiFrameInput[],
  sourceFiles: Map<string, { name: string; type: "video" | "photo"; frameCount: number }>,
  templateName?: string,
  attempt = 0
): Promise<ScoredFrame[]> {
  const systemPrompt = buildScoringSystemPrompt(sourceFiles, templateName);
  const content = buildScoringContent(batch);

  try {
    const response = await fetchWithRetry(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 16000,
          system: [
            {
              type: "text",
              text: systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content }],
        }),
      },
      "Scoring batch"
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error(`Scoring batch error (attempt ${attempt + 1}):`, response.status, errorBody);

      // Don't retry client errors (4xx except 429) — they'll fail identically every time
      const isRetryable = response.status === 429 || response.status >= 500;
      if (isRetryable && attempt < MAX_BATCH_RETRIES) {
        await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)));
        return analyzeMultiBatch(apiKey, batch, sourceFiles, templateName, attempt + 1);
      }
      throw new Error(`Scoring failed (HTTP ${response.status}): ${errorBody.slice(0, 200)}`);
    }

    const data = await response.json();

    // Warn on truncated response — still attempt to parse what we got
    if (data.stop_reason === "max_tokens") {
      console.warn("Scoring batch: response truncated (max_tokens reached) — parsing partial result");
    }

    // Extract the text block from the response content array.
    let text: string | null = null;
    if (Array.isArray(data.content)) {
      const textBlock = data.content.find((b: { type: string; text?: string }) => b.type === "text");
      text = textBlock?.text ?? null;
    }

    if (!text) {
      const preview = JSON.stringify(data).slice(0, 300);
      console.warn(`Scoring: no text block in response (attempt ${attempt + 1}):`, preview);
      if (attempt < MAX_BATCH_RETRIES) {
        await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)));
        return analyzeMultiBatch(apiKey, batch, sourceFiles, templateName, attempt + 1);
      }
      throw new Error(`Scoring returned no text content after ${attempt + 1} attempts`);
    }

    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      console.warn(`Scoring: unparsable response (attempt ${attempt + 1}):`, text.slice(0, 300));
      if (attempt < MAX_BATCH_RETRIES) {
        await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)));
        return analyzeMultiBatch(apiKey, batch, sourceFiles, templateName, attempt + 1);
      }
      throw new Error(`Scoring returned unparsable response after ${attempt + 1} attempts`);
    }

    const parsed = safeParseJSONArray(jsonMatch[0]) as Array<{
      index: number;
      score: number;
      label: string;
      role?: string;
    }>;

    if (!Array.isArray(parsed)) {
      console.warn(`Scoring: JSON parsed to non-array (attempt ${attempt + 1}):`, typeof parsed);
      if (attempt < MAX_BATCH_RETRIES) {
        await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)));
        return analyzeMultiBatch(apiKey, batch, sourceFiles, templateName, attempt + 1);
      }
      throw new Error(`Scoring returned non-array JSON after ${attempt + 1} attempts`);
    }

    const results: ScoredFrame[] = [];
    for (const p of parsed) {
      // Validate frame index — skip entries that point outside the batch
      if (!Number.isInteger(p.index) || p.index < 0 || p.index >= batch.length) {
        console.warn(`Scoring: invalid frame index ${p.index} (batch has ${batch.length} frames), skipping`);
        continue;
      }
      if (typeof p.score !== "number" || isNaN(p.score)) {
        console.warn(`Scoring: invalid score ${p.score} for frame ${p.index}, skipping`);
        continue;
      }
      const frame = batch[p.index];
      results.push({
        sourceFileId: frame.sourceFileId,
        sourceType: frame.sourceType,
        timestamp: frame.timestamp,
        score: Math.max(0, Math.min(1, p.score)),
        label: p.label || "highlight",
        narrativeRole: (p.role && VALID_ROLES.includes(p.role)) ? p.role : undefined,
      });
    }
    return results;
  } catch (err) {
    console.error(`Scoring batch exception (attempt ${attempt + 1}):`, err);
    if (attempt < MAX_BATCH_RETRIES) {
      await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)));
      return analyzeMultiBatch(apiKey, batch, sourceFiles, templateName, attempt + 1);
    }
    throw new Error(`Scoring batch failed after ${attempt + 1} attempts: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Second-pass: ask Claude to plan the final highlight tape order
 * from the scored frames across all source files.
 */
const VALID_THEMES: DetectedTheme[] = [
  "sports", "cooking", "travel", "gaming", "party", "fitness", "pets", "vlog", "wedding", "cinematic",
];

/**
 * Select frames for the planner — sends as many as the API allows.
 * Every source gets at least 1 frame, then fills remaining budget by score.
 *
 * Claude API hard limits (Messages API):
 * - 100 images per request
 * - 32 MB total payload
 * - 5 MB per individual image
 * We leave headroom for the system prompt + score text + JSON overhead.
 */
/** Build a lookup key from source file ID + timestamp with enough precision to avoid collisions.
 * Using 3 decimal places (ms precision) prevents the collisions that .toFixed(1) caused. */
function frameKey(sourceFileId: string, timestamp: number): string {
  return `${sourceFileId}::${timestamp.toFixed(3)}`;
}

const API_MAX_IMAGES = 60; // Top-scored frames for visual verification; planner has TEXT scores for ALL frames
const API_IMAGE_PAYLOAD_BUDGET = 9 * 1024 * 1024; // 9 MB budget (480p/0.6 frames are ~20-50KB each)
const API_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per image

function selectPlannerFrames(
  scores: ScoredFrame[],
  frames: MultiFrameInput[],
): MultiFrameInput[] {
  // Build a lookup from (sourceFileId, timestamp) → frame
  const frameLookup = new Map<string, MultiFrameInput>();
  for (const f of frames) {
    frameLookup.set(frameKey(f.sourceFileId, f.timestamp), f);
  }

  // Group scores by source, sorted best-first
  const bySource = new Map<string, ScoredFrame[]>();
  for (const s of scores) {
    if (!bySource.has(s.sourceFileId)) bySource.set(s.sourceFileId, []);
    bySource.get(s.sourceFileId)!.push(s);
  }
  for (const [, fileScores] of bySource) {
    fileScores.sort((a, b) => b.score - a.score);
  }

  const selected: MultiFrameInput[] = [];
  const usedKeys = new Set<string>();
  let totalBytes = 0;

  // Track selected timestamps per source to enforce temporal diversity
  const selectedTimestamps = new Map<string, number[]>();
  const MIN_TEMPORAL_GAP_S = 3; // Minimum seconds between selected frames from the same source

  function addFrame(score: ScoredFrame, enforceGap: boolean): boolean {
    if (selected.length >= API_MAX_IMAGES) return false;
    const key = frameKey(score.sourceFileId, score.timestamp);
    const frame = frameLookup.get(key);
    if (!frame || usedKeys.has(key)) return false;

    const frameBytes = frame.base64.length; // base64 string length ≈ bytes in JSON
    if (frameBytes > API_MAX_IMAGE_BYTES) return false; // skip oversized images
    if (totalBytes + frameBytes > API_IMAGE_PAYLOAD_BUDGET) return false; // would exceed budget

    // Temporal diversity: skip if too close to an already-selected frame from the same source
    if (enforceGap) {
      const sourceTimes = selectedTimestamps.get(score.sourceFileId);
      if (sourceTimes?.some((t) => Math.abs(t - score.timestamp) < MIN_TEMPORAL_GAP_S)) {
        return false;
      }
    }

    selected.push(frame);
    usedKeys.add(key);
    totalBytes += frameBytes;
    if (!selectedTimestamps.has(score.sourceFileId)) selectedTimestamps.set(score.sourceFileId, []);
    selectedTimestamps.get(score.sourceFileId)!.push(score.timestamp);
    return true;
  }

  // Phase 1: guarantee at least one frame per source (the best-scored one)
  for (const [, fileScores] of bySource) {
    if (fileScores.length > 0) addFrame(fileScores[0], false);
  }

  const allSorted = [...scores].sort((a, b) => b.score - a.score);

  // Phase 2: fill with highest-scored frames, enforcing minimum temporal gap
  // This prevents 5 frames from the same 5-second confetti moment eating 5 slots
  for (const s of allSorted) {
    if (selected.length >= API_MAX_IMAGES || totalBytes >= API_IMAGE_PAYLOAD_BUDGET) break;
    addFrame(s, true);
  }

  // Phase 3: if still under budget, fill remaining WITHOUT gap enforcement
  // Ensures we always get close to 60 frames even with dense scoring
  if (selected.length < API_MAX_IMAGES && totalBytes < API_IMAGE_PAYLOAD_BUDGET) {
    for (const s of allSorted) {
      if (selected.length >= API_MAX_IMAGES || totalBytes >= API_IMAGE_PAYLOAD_BUDGET) break;
      addFrame(s, false);
    }
  }

  // Per-source cap: no single source should exceed 70% of selected frames.
  // If a source dominates, shed its lowest-scored surplus frames.
  const SOURCE_CAP_RATIO = 0.7;
  const maxPerSource = Math.max(1, Math.ceil(selected.length * SOURCE_CAP_RATIO));
  const countBySource = new Map<string, number>();
  for (const f of selected) {
    countBySource.set(f.sourceFileId, (countBySource.get(f.sourceFileId) ?? 0) + 1);
  }
  const overRepresented = new Set<string>();
  for (const [src, count] of countBySource) {
    if (count > maxPerSource) overRepresented.add(src);
  }
  if (overRepresented.size > 0) {
    // Build per-source score lookup for shedding lowest-scored frames
    const scoreLookup = new Map<string, number>();
    for (const s of scores) {
      scoreLookup.set(frameKey(s.sourceFileId, s.timestamp), s.score);
    }
    // Sort selected frames from that source by score ascending (shed worst first)
    const toShed: number[] = [];
    for (const src of overRepresented) {
      const indices = selected
        .map((f, i) => ({ i, score: scoreLookup.get(frameKey(f.sourceFileId, f.timestamp)) ?? 0 }))
        .filter((_, idx) => selected[idx].sourceFileId === src)
        .sort((a, b) => a.score - b.score);
      const excess = (countBySource.get(src) ?? 0) - maxPerSource;
      for (let j = 0; j < excess && j < indices.length; j++) {
        toShed.push(indices[j].i);
      }
    }
    if (toShed.length > 0) {
      const shedSet = new Set(toShed);
      const before = selected.length;
      const kept = selected.filter((_, i) => !shedSet.has(i));
      selected.length = 0;
      selected.push(...kept);
      debugLog(`Planner: shed ${before - selected.length} frames to enforce ${(SOURCE_CAP_RATIO * 100).toFixed(0)}% per-source cap`);
    }
  }

  // Sort by (source, timestamp) so the planner sees a coherent temporal narrative
  selected.sort((a, b) => {
    if (a.sourceFileId !== b.sourceFileId) return a.sourceFileId.localeCompare(b.sourceFileId);
    return a.timestamp - b.timestamp;
  });

  debugLog(`Planner: sending ${selected.length}/${frames.length} frames (~${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
  return selected;
}

async function planHighlightTape(
  apiKey: string,
  scores: ScoredFrame[],
  allFrames: MultiFrameInput[],
  sourceFiles: Map<string, { name: string; type: "video" | "photo"; frameCount: number }>,
  templateName?: string,
  userFeedback?: string,
  creativeDirection?: string,
  onPhase?: (phase: SSEStreamPhase) => void,
  photoAnimations?: PhotoAnimationInfo[],
  onPartial?: OnPartialField
): Promise<{ clips: DetectedClip[]; detectedTheme: DetectedTheme; contentSummary: string; productionPlan?: ProductionPlan }> {
  // Compute approximate duration for each source from max timestamp + sample interval
  const sourceDurations = new Map<string, number>();
  for (const f of allFrames) {
    const current = sourceDurations.get(f.sourceFileId) ?? 0;
    if (f.timestamp > current) sourceDurations.set(f.sourceFileId, f.timestamp);
  }

  // Build animation lookup for photos
  const animationLookup = new Map<string, PhotoAnimationInfo>();
  if (photoAnimations) {
    for (const pa of photoAnimations) {
      animationLookup.set(pa.sourceFileId, pa);
    }
  }

  const sourceList = Array.from(sourceFiles.entries())
    .map(([id, info]) => {
      const approxDuration = (sourceDurations.get(id) ?? 0) + 2; // +2s for last sample interval
      const durationStr = info.type === "photo" ? "photo (still)" : `~${approxDuration.toFixed(0)}s duration`;
      let line = `- "${info.name}" (${info.type}, ID: ${id}, ${info.frameCount} frames sampled, ${durationStr})`;
      // Include animation info for photos
      const animInfo = animationLookup.get(id);
      if (animInfo?.animatePhoto) {
        line += animInfo.animationInstructions
          ? ` [ANIMATE — user wants: "${animInfo.animationInstructions}"]`
          : ` [ANIMATE — generate a motion prompt for this photo]`;
      }
      return line;
    })
    .join("\n");

  // Send ALL scores grouped by source, with temporal ordering within each source
  const scoresBySource = new Map<string, ScoredFrame[]>();
  for (const s of scores) {
    if (!scoresBySource.has(s.sourceFileId)) scoresBySource.set(s.sourceFileId, []);
    scoresBySource.get(s.sourceFileId)!.push(s);
  }

  // Build audio lookups from frames
  const audioLookup = new Map<string, number>();
  const onsetLookup = new Map<string, number>();
  const specLookup = new Map<string, { bass: number; mid: number; treble: number }>();
  for (const f of allFrames) {
    const key = frameKey(f.sourceFileId, f.timestamp);
    if (f.audioEnergy != null) audioLookup.set(key, f.audioEnergy);
    if (f.audioOnset != null) onsetLookup.set(key, f.audioOnset);
    if (f.audioBass != null) specLookup.set(key, { bass: f.audioBass, mid: f.audioMid ?? 0, treble: f.audioTreble ?? 0 });
  }

  const allScoresSummary = Array.from(scoresBySource.entries())
    .map(([fileId, fileScores]) => {
      const info = sourceFiles.get(fileId);
      const header = `── ${info?.name ?? fileId} (${info?.type ?? "video"}) ──`;
      const sorted = [...fileScores].sort((a, b) => a.timestamp - b.timestamp); // temporal order
      const lines = sorted.map(
        (s) => {
          const roleTag = s.narrativeRole ? ` [${s.narrativeRole}]` : "";
          const key = frameKey(s.sourceFileId, s.timestamp);
          const audioVal = audioLookup.get(key);
          const onsetVal = onsetLookup.get(key);
          const audioTag = audioVal != null ? `  audio:${audioVal.toFixed(2)}` : "";
          const onsetTag = onsetVal != null && onsetVal > 0.1 ? `  onset:${onsetVal.toFixed(2)}` : "";
          const spec = specLookup.get(key);
          const specTag = (spec && audioVal != null && audioVal > 0.1) ? `  spectrum:B${spec.bass.toFixed(2)}/M${spec.mid.toFixed(2)}/T${spec.treble.toFixed(2)}` : "";
          return `  t:${s.timestamp.toFixed(1)}s  score:${s.score.toFixed(2)}${audioTag}${onsetTag}${specTag}${roleTag}  "${s.label}"`;
        }
      );

      // Build ASCII audio visualizations for this source
      const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
      const audioVals = sorted.map((s) => audioLookup.get(frameKey(s.sourceFileId, s.timestamp))).filter((v): v is number => v != null);
      const onsetVals = sorted.map((s) => onsetLookup.get(frameKey(s.sourceFileId, s.timestamp))).filter((v): v is number => v != null);
      const audioViz = audioVals.length > 0
        ? `  Audio energy:  ${audioVals.map((v) => bars[Math.min(7, Math.floor(v * 8))]).join("")}`
        : "";
      const onsetViz = onsetVals.length > 0
        ? `  Audio onsets:  ${onsetVals.map((v) => bars[Math.min(7, Math.floor(v * 8))]).join("")}  (peaks = beat hits / impacts)`
        : "";

      return `${header}${audioViz ? "\n" + audioViz : ""}${onsetViz ? "\n" + onsetViz : ""}\n${lines.join("\n")}`;
    })
    .join("\n\n");

  // Select diverse frames for the planner to actually SEE
  const plannerFrames = selectPlannerFrames(scores, allFrames);

  const sourceCount = sourceFiles.size;

  const systemPrompt = `You are an elite Instagram Reels editor. Your content consistently hits 1M+ views because
you understand Instagram's algorithm AND human psychology at a deep level.

You are being shown the ACTUAL FRAMES from the user's footage. Study every single one deeply.
You have full creative control. No limits on clip count, total reel length, or how you structure
the tape. Each clip must be at least 2 seconds (let moments breathe). YOU are the editor. Make something incredible.

SOURCE FILES (${sourceCount} total):
${sourceList}

EVERY SCORED MOMENT (from frame-by-frame analysis — your complete footage map):
${allScoresSummary}

═══════════════════════════════════════════════
HOW INSTAGRAM'S ALGORITHM ACTUALLY WORKS
═══════════════════════════════════════════════
The algorithm ranks Reels by predicted engagement. The signals, IN ORDER OF WEIGHT:
1. WATCH-THROUGH RATE — % of viewers who watch the entire reel (most important)
2. REPLAYS — viewers watching 2+ times (this is why loops matter)
3. SAVES — bookmarks. Instagram treats a save as "this content has lasting value"
4. SHARES — DMs and story reposts. "I need someone else to see this"
5. COMMENTS — engagement signal, especially fast comments (means strong reaction)
6. LIKES — weakest signal but still counted

Your job is to maximize ALL of these. The edit structure directly affects every one:
- Hook → watch-through rate. Bad hook = 65% of viewers gone in 1.5s
- Pacing → watch-through. Monotonous rhythm = viewers lose interest at 4-6s
- Emotional peaks → saves + shares. "I need to keep this / show someone this"
- Loop design → replays. When the end connects to the start = automatic rewatch
- Surprise/humor → comments. Unexpected moments trigger impulse commenting

═══════════════════════════════════════════════
ABSOLUTE RULE: USE EVERY SOURCE FILE
═══════════════════════════════════════════════
The user uploaded ${sourceCount} files. They chose these files for a reason.
You MUST include at least one clip from EVERY single source file. No exceptions.
- Strong sources → longer, more prominent clips that carry the tape
- Weaker sources → shorter appearances. Even a brief flash, a reaction cutaway, or a
  transitional beat is better than leaving it out entirely. YOU decide how long.
- The user should NEVER open their highlight reel and think "where's my clip?"

═══════════════════════════════════════════════
YOUR PROCESS — Full creative autonomy
═══════════════════════════════════════════════

STEP 1: DEEPLY UNDERSTAND THE CONTENT
Study every frame image. Read every score and label. Build a COMPLETE mental model:
- What's the STORY across all this footage? What happened? What's the emotional arc?
- Who are the people? What are they doing? What's the setting/mood/energy?
- What are the absolute PEAK moments vs. the quieter supporting moments?
- What makes this content special? What would make someone who wasn't there feel like they were?

CROSS-SOURCE CONNECTIONS — this is what separates great editors from good ones:
- Look for CAUSE → EFFECT across sources (goal scored in one source → crowd reaction in another)
- Look for BEFORE → AFTER (preparation → result, setup → payoff)
- Look for CONTRAST (quiet → loud, small → big, solo → group, stillness → explosion)
- Look for MATCHING ENERGY (moments from different sources that share a vibe — cut between them)
- Look for REACTION SHOTS (faces from one source that amplify moments from another)
When you find these connections, EXPLOIT them. Juxtaposing connected moments from different
sources creates a sense of storytelling that single-source edits can't achieve.

Put your understanding in a "contentSummary" field (2-3 vivid sentences).

STEP 2: LABEL THE THEME (for UI display only — does NOT control your creative decisions)
Pick a theme label that best describes this content. This is ONLY used in the UI header — it does
NOT restrict your transitions, filters, velocity, or any other editing choice. YOU control everything.
Valid labels: "sports", "cooking", "travel", "gaming", "party", "fitness", "pets", "vlog", "wedding", "cinematic"

STEP 2.5: READ THE AUDIO — THREE SIGNAL LAYERS
Each frame has audioEnergy (volume), audioOnset (beat detection), and frequency spectrum (bass/mid/treble).
Each source has ASCII visualizations of energy and onset. This is how pro editors sync cuts to sound.

AUDIO ENERGY = volume at this moment:
- High (0.7+) = loud (cheering, music peak, action). Low (0-0.3) = quiet (silence, calm).

AUDIO ONSET = the beat detector. How much energy CHANGED from the previous frame:
- High onset (0.5+) = TRANSIENT. Something just happened: beat hit, clap, impact, bass drop, voice starting.
- The onset visualization shows you exactly where the rhythm of the footage lives.
- Peaks in the onset graph = natural cut points. This is where transitions should land.

FREQUENCY SPECTRUM = what KIND of audio (spectrum: B=bass / M=mid / T=treble, ratios sum to ~1.0):
- Mid-dominant (M > 0.5): SPEECH — someone talking, narrating, reacting vocally
- Bass-dominant (B > 0.4) + onset peaks: MUSIC with a beat — drums, bass drops, rhythmic music
- Broad spectrum (all 0.2-0.5): Full mix — music with vocals, rich layered soundscape
- Treble-heavy (T > 0.4): Bright transients — cymbals, crowd hiss, sibilant speech

SPEECH vs MUSIC EDITING RULES:
- SPEECH (mid-dominant): NEVER cut mid-sentence. Start/end clips at speech pauses (low energy gaps).
  Keep "normal" velocity — slow-mo makes speech unintelligible and breaks immersion.
  Use softer transitions (crossfade, dip_to_black) — punchy transitions feel jarring over dialog.
- MUSIC (bass-dominant + onsets): Sync cuts to onset peaks. Speed ramps and velocity hits feel incredible.
  Punchy transitions (flash, zoom_punch, whip) amplify beat drops. This is where you go hard.
- MIXED (speech over music): Treat as speech — preserve dialog intelligibility above all.
- SILENCE (low energy, no dominant band): Natural cut points. Perfect for dramatic pauses and breathing room.

USE AUDIO FOR EVERY EDITING DECISION:
- START clips at high-onset timestamps — cuts landing on sound hits feel intentional and "tight"
- END clips at low-energy, low-onset moments — natural silence boundaries = clean exits
- Match transition TYPE to audio: flash/zoom_punch on high onset, crossfade on low onset
- VELOCITY + audio: place the slow-mo zone where audio energy peaks (dramatic emphasis)
- High onset + high visual score = absolute HERO moment — the audio and visual peak together
- Rising energy, low onset = building tension — perfect for ramp_in velocity
- High onset + calm visual = off-screen event (reaction opportunity, cut to source with the action)
- Cluster of high onsets = rhythmic section — use montage velocity, rapid cuts, beat-sync energy

STEP 3: CHOOSE YOUR REEL STRUCTURE
Before placing a single clip, decide the ARCHITECTURE. Random clip order = amateur.
Intentional structure = professional. Choose the pattern that fits YOUR content:

COLD OPEN — Start at the climax, then rewind to build back.
  Clip 1 is the peak moment (teaser). Then context/build-up. Then we arrive at the full peak again.
  Best for: one big moment with a story (the winning goal, the proposal, the reveal).
  Why it works: instant hook + curiosity ("how did we get here?") + satisfying payoff.

ESCALATION — Each clip tops the last. Start strong, end STRONGEST.
  Low energy → medium → high → higher → HIGHEST. The reel is a crescendo.
  Best for: highlight compilations, trip montages, "best of" content.
  Why it works: every clip feels like "it can't get better" → and then it does.

CONTRAST CUT — Alternate between opposing energies. A ↔ B ↔ A ↔ B.
  Quiet → loud. Before → after. Solo → group. Stillness → explosion.
  Best for: transformations, multi-source variety, day/night content.
  Why it works: contrast amplifies both sides. Silence makes the drop LOUDER.

RHYTHM BUILD — Short punchy clips that get longer as stakes increase.
  0.5s, 0.5s, 0.5s, 0.8s, 0.8s, 1.5s, 3s hero, 0.5s, 0.5s, 2s closer.
  Best for: music-driven edits, party content, sports montages, dance compilations.
  Why it works: fast cuts create urgency, longer clips create weight. The rhythm IS the story.

EMOTIONAL ARC — Setup → rising tension → climax → emotional release → reflective close.
  The classic story structure. Works for EVERYTHING when done well.
  Best for: event films, wedding content, day-in-the-life, travel stories.
  Why it works: humans are wired for narrative. A story with a climax feels COMPLETE.

THE HOOK (Clip 1): 65% of viewers decide in the first 1.5 seconds. Period.
Your first clip MUST be the single most visually striking, emotionally compelling, or
unexpected moment in the footage. On a 6-inch phone, mid-scroll, half-brightness — does
this STOP a thumb? If you chose Cold Open, this is your climax teaser. If Escalation,
this is your lowest bar (but it still needs to be strong enough to HOOK).

RETENTION (Middle clips): The 3-SECOND BRAIN — mobile viewers re-evaluate every 3 seconds.
Every 3 seconds, something must change: new clip, new energy level, new visual, speed shift.
- ENERGY OSCILLATION: high ↔ low, close ↔ wide, fast ↔ slow, loud ↔ quiet
- TENSION-RELEASE CYCLES: build → payoff → breathe → build. Never sustain one energy too long.
- CROSS-SOURCE CUTTING: alternate between sources for variety and implied storytelling
- DURATION VARIATION: mix 0.5s beats with 3-4s hero holds. Monotonous timing = death.
- INFORMATION DENSITY: every clip adds something NEW — angle, emotion, information, energy level
- MICRO-HOOKS: moments that make the viewer think "wait, what comes next?" — keep them past the mid-point

THE CLOSE (Last clip): Must serve TWO purposes simultaneously:
1. EMOTIONAL PEAK — the viewer should feel satisfied, awed, delighted, or moved
2. LOOP TRIGGER — when the reel restarts, the last→first transition should feel intentional.
   Match energy levels (both high, or both calm). A great loop = 2-3x watches = algorithm boost.

YOU DECIDE EVERYTHING:
- How many clips to use (as many as the content needs)
- How long each clip is — MINIMUM 2 seconds per clip. Most clips should be 3-6 seconds.
  Your BEST moment deserves the most screen time — make it 5-6 seconds.
  Vary your durations based on the content. If every clip is the same length, it feels robotic.
- Aim for a total reel of 15-45 seconds. Under 10s feels rushed and incomplete.
- How long photos display (3-5 seconds typically — give viewers time to absorb the image)
- The clip ordering, pacing, and rhythm — all of it is your call
- Avoid consecutive clips from the same source file when possible — variety keeps attention
- NEVER repeat the same clip. Each (sourceFileId, startTime, endTime) must be UNIQUE.
  If a moment deserves emphasis, make the clip longer or use a different section — don't duplicate it.
- NEVER select visually similar moments from the same source. If two timestamps show the same
  scene, subject, or composition (e.g., same sign, same angle, same action, same background),
  pick ONLY the single best one. Viewers notice repetition INSTANTLY — it looks like a bug.
  Even moments 5-10 seconds apart can look identical if the camera barely moved. When in doubt,
  use ONE clip from that source and make it longer instead of picking multiple similar sections.
- Spread selections across source files when possible, but if one source has the best moments, use it.
  Quality over equal distribution — never pad with weak clips just to balance sources.
${templateName ? `- Style context: ${templateName} template` : ""}

STEP 4: FULL VISUAL STYLE — You are the editor, not a template.
For each clip, you make EVERY visual decision. Think about what makes NFL player pages and
top influencer reels look so polished — it's because every single cut, color grade, and
effect is chosen intentionally for THAT specific moment.

VELOCITY — Design a UNIQUE speed curve for each clip using "velocityKeyframes":
Set "velocityKeyframes" to an array of {position: 0-1, speed: 0.1-5.0} objects (minimum 2 keyframes).
Position = where in the clip (0=start, 1=end). Speed = playback rate (0.25=slow-mo, 3.0=fast).
The renderer smoothly interpolates between your keyframes with cubic easing.

Examples — but DESIGN YOUR OWN for each clip:
- Late slow-mo hit: [{position:0,speed:1.5},{position:0.6,speed:1.5},{position:0.7,speed:0.3},{position:0.85,speed:0.3},{position:1,speed:2.0}]
- Double pulse: [{position:0,speed:2.0},{position:0.2,speed:0.4},{position:0.35,speed:2.5},{position:0.6,speed:0.4},{position:0.75,speed:2.0},{position:1,speed:1.0}]
- Freeze frame effect: [{position:0,speed:1.0},{position:0.45,speed:1.0},{position:0.5,speed:0.1},{position:0.55,speed:0.1},{position:0.6,speed:2.0},{position:1,speed:1.0}]
- Smooth deceleration: [{position:0,speed:3.0},{position:0.5,speed:1.0},{position:1,speed:0.3}]
- Constant speed: [{position:0,speed:1.0},{position:1,speed:1.0}]

Place the slow-mo exactly where the peak moment is. Each clip should have a DIFFERENT curve.
If you must, you can set "velocityPreset" instead: "hero","bullet","ramp_out","ramp_in","montage","normal"
— but custom keyframes are STRONGLY preferred. Using the same preset on multiple clips looks lazy.

KEY INSIGHT: Your startTime and endTime control WHERE the peak moment falls within the speed curve.
Place clip boundaries so the moment you want emphasized lands in the slow part of your curve.

VELOCITY ARC OF THE TAPE — the speed ramp pattern should feel like a song:
Intro (gentle/normal) → Build (accelerating) → DROP (slow-mo hit) →
Recovery (normal) → Second build → Finale (slow-mo hero) → Outro (decelerate into loop)

TRANSITIONS ARE NOT DECORATION — THEY CREATE MEANING.
Every cut communicates RELATIONSHIP between the outgoing and incoming moment.
Choose the transition that tells the RIGHT STORY for that specific cut:

"zoom_punch" → IMPACT. Slamming the viewer into a moment. "LOOK AT THIS."
  Use entering: action peaks, reveals, dramatic moments. The incoming clip MUST justify the energy.
"flash" → PUNCTUATION. A visual exclamation mark. Something just happened.
  Use on: beat drops, impacts, surprise moments. The flash says "did you SEE that?"
"hard_flash" → EXPLOSION. Darken → blast → reveal. Maximum dramatic weight.
  Use on: the single biggest moment in the tape. The climactic cut. Use sparingly (1-2 per reel max).
"whip" → MOMENTUM. Energy is flowing, we're going somewhere, time is moving.
  Use between: moments with forward motion, scene changes that maintain energy, montage rhythm.
"glitch" → DISRUPTION. Something unexpected. Digital chaos, surprise incoming.
  Use before: reveals, tonal shifts, between contrasting moments. Injects unpredictability.
"crossfade" → CONNECTION. These moments are linked. One BECOMES the other.
  Use between: emotionally connected moments, same-subject different-angle, parallel stories.
"light_leak" → MEMORY. Warmth, nostalgia, beauty. A soft emotional bridge.
  Use into: beautiful/sentimental moments, golden hour, intimate scenes. Feels like remembering.
"soft_zoom" → DRIFT. Gentle, contemplative. The visual equivalent of a deep breath.
  Use into: establishing shots, calm moments, beauty reveals. Creates breathing room.
"dip_to_black" → CHAPTER BREAK. A breath. Reset. "That was one thing, this is another."
  Use on: major mood shifts, before the final act, after an emotional peak that needs space.
"color_flash" → SYNESTHESIA. A beat you can SEE. Rhythm made visual. Neon energy.
  Use on: music beats, rapid montage cuts, party/gaming energy, stylistic accents.
"strobe" → RAPID-FIRE. Sensory overload, peak excitement, maximum energy.
  Use on: climactic montage sequences, before a dramatic slowdown for contrast. Very intense.
"hard_cut" → CONFIDENCE. No frills. "This content speaks for itself."
  Use for: vlog style, when content is strong enough to carry, direct jumps, clean rhythm.

CRITICAL PRINCIPLE: Match transition energy to what FOLLOWS, not what precedes.
The transition PREPARES the viewer for what's coming. A zoom_punch into a calm scene = dissonant.
A crossfade into an explosion = underwhelming. The transition is the PROMISE, the next clip is the DELIVERY.
Never repeat the same transition twice in a row. Set transitionDuration: 0.15s (snappy) to 1.0s (cinematic).

COLOR GRADING — Design a UNIQUE color grade for each clip using "filterCSS":
Set "filterCSS" to a CSS filter string using any combination of:
saturate(), contrast(), brightness(), sepia(), hue-rotate(), grayscale(), blur(), invert(), opacity()

Examples — but DESIGN YOUR OWN for each clip:
- Intense teal-orange cinema: "saturate(1.4) contrast(1.3) brightness(0.95) hue-rotate(8deg)"
- Dreamy pastel: "saturate(0.7) brightness(1.15) contrast(0.85) sepia(0.1)"
- Dark moody: "saturate(0.8) contrast(1.4) brightness(0.85) hue-rotate(10deg)"
- Warm film grain: "sepia(0.3) saturate(1.1) contrast(1.15) brightness(1.02)"
- High-energy pop: "saturate(1.8) contrast(1.2) brightness(1.05)"
- Cool editorial: "saturate(0.6) contrast(1.1) brightness(1.08) hue-rotate(15deg)"
- Natural clean: "saturate(1.05) contrast(1.05) brightness(1.0)"

Each clip should get its OWN custom grade — never use the same filterCSS on two clips.
If you must, you can set "filter" to a named preset ("TealOrange","GoldenHour","MoodyCinematic",
"Vibrant","Warm","Cool","CleanAiry","VintageFilm","Noir","Fade","None") — but custom CSS is
STRONGLY preferred. Reusing the same named preset looks generic.

COLOR SHIFT PATTERNS that create emotional journeys:
- Warm opener → intense action → warm close = "cozy → intense → cozy" (satisfaction loop)
- Dark moody build → vibrant drop = tension → release (the color change IS the payoff)
- Desaturated past → bright present = nostalgia → now (time contrast)
Don't use one grade for everything. 2-3 intentional shifts across the tape = professional.

ENTRY PUNCH — the zoom "pop" when each clip appears (1.0 = none, 1.01-1.05 = subtle to dramatic):
Action clips → 1.03-1.05 (impactful pop). Emotional clips → 1.0-1.01 (gentle or none).

CAPTIONS — text that AMPLIFIES, never NARRATES. Leave empty unless it makes the moment HIT harder:
2-5 words max. The text should add a layer the visual alone can't provide.
- Emotional amplifier: "no way." / "that feeling." / "every. single. time."
- Context that transforms meaning: "day 1 vs day 365" / "she had no idea" / "watch this"
- Reaction trigger: "wait for it" / "the precision." / "obsessed"
Use captions on 30-50% of clips max. Over-captioning = amateur. Strategic captions = editorial.

CAPTION STYLING — You have FULL CREATIVE CONTROL over every caption's look:

captionStyle is a fallback preset: "Bold", "Minimal", "Neon", or "Classic".
But you can OVERRIDE everything with custom caption parameters:

captionAnimation — entrance effect: "pop" (bounce scale), "slide" (slide up + fade),
  "flicker" (neon sign turning on), "typewriter" (characters reveal), "fade" (simple fade), "none"
captionFontWeight — 100 (thin) to 900 (black). 300=light, 700=bold, 900=heavy.
captionFontStyle — "normal" or "italic"
captionFontFamily — "sans-serif" (modern), "serif" (elegant), "mono" (technical)
captionColor — hex color e.g. "#ffffff" (white), "#ffd700" (gold), "#ff3366" (hot pink)
captionGlowColor — hex color for glow effect e.g. "#7c3aed" (purple), "#06b6d4" (teal). Omit for no glow.
captionGlowRadius — 0-30 pixels. 10=subtle, 20=dramatic, 30=intense.

Examples of custom caption looks:
- Neon teal glow: {captionAnimation:"flicker", captionFontWeight:700, captionColor:"#ffffff", captionGlowColor:"#06b6d4", captionGlowRadius:20}
- Elegant gold serif: {captionAnimation:"fade", captionFontWeight:300, captionFontStyle:"italic", captionFontFamily:"serif", captionColor:"#ffd700"}
- Bold pink impact: {captionAnimation:"pop", captionFontWeight:900, captionColor:"#ff3366", captionGlowColor:"#ff3366", captionGlowRadius:15}
- Clean minimal: {captionAnimation:"slide", captionFontWeight:300, captionColor:"#ffffff"}

DESIGN UNIQUE CAPTION STYLES FOR EACH CLIP. Match the look to the moment's energy and emotion.

KEN BURNS — for PHOTO clips only, set zoom intensity (0.0-0.08):
0.02 = subtle drift. 0.05 = noticeable. 0.08 = dramatic. Match energy to the edit's pacing.

PHOTO ANIMATION — some photos are marked [ANIMATE] in the source list above.
For these photos, you MUST include an "animationPrompt" field in the clip JSON.
This prompt will be sent to Kling (image-to-video AI) to BRING THE PHOTO TO LIFE.
The goal is realistic subject motion — people move, animals react, nature flows — not just camera tricks.
Think about what would ACTUALLY HAPPEN next if the photo unfroze. Make it feel alive.
Analyze the photo holistically: the subjects, their poses, the environment, the mood, and the edit context.
- If the user provided instructions (shown after "user wants:"), incorporate them into your prompt.
- If no instructions, imagine what natural motion would occur and describe it vividly.
- PRIORITIZE SUBJECT MOTION over camera motion. Describe what the people/animals/objects DO:
  "Person on couch starts to stand up, stretches arms, turns head toward camera with a smile"
  "Dog leaps up excitedly, tail wagging fast, ears perking up, tongue out"
  "Athlete mid-stride pushes off and sprints forward, jersey rippling, crowd blurs behind"
  "Waves crash onto shore, foam spreads across sand, seagrass sways in wind"
  "Child blows out birthday candles, smoke wisps rise, nearby kids cheer and clap"
- You CAN add subtle camera motion too (slow push-in, gentle drift) but subject motion comes first.
- Keep prompts under 300 characters. Be specific about what moves, how, and in what order.
- For non-animated photos, do NOT include animationPrompt — they use Ken Burns.

YOU CONTROL EVERYTHING PER CLIP. For each clip, provide:
sourceFileId, startTime, endTime (MUST be 2+ seconds apart), label, confidenceScore,
velocityKeyframes (REQUIRED — custom speed curve for this clip),
transitionType (REQUIRED for every clip except the first),
transitionDuration (REQUIRED — 0.15-1.0s),
filterCSS (REQUIRED — custom CSS color grade for this clip),
entryPunchScale (REQUIRED — 1.0 = none, up to 1.1),
entryPunchDuration (REQUIRED — 0.1 = snappy, 0.3 = smooth),
kenBurnsIntensity (photos only, 0-0.08),
animationPrompt (REQUIRED for [ANIMATE] photos — motion description for Kling),
captionText (optional — only 30-50% of clips),
captionAnimation, captionFontWeight, captionColor, captionGlowColor, captionGlowRadius (when using captions)

═══════════════════════════════════════════════
STEP 5: AI PRODUCTION PLAN — You are the CREATIVE DIRECTOR
═══════════════════════════════════════════════
Beyond clip selection and visual style, you direct the FULL AUDIO-VISUAL PRODUCTION.
Your plan drives automated generation of intro/outro cards, sound effects, voiceover, music, and thumbnails.
Every decision cascades from the content's theme AND the user's creative direction (if any).

Use TASTE and RESTRAINT. Not every tape needs every element. A clean travel montage may only
need music + a subtle intro. A hype sports reel may benefit from SFX + voiceover + intro/outro.
A quiet wedding highlight might need nothing but music and gentle transitions.
Only add elements that genuinely elevate the content. Less is often more.

INTRO CARD — An AI-generated video title card prepended to the tape.
Set "intro" to {"text": "TITLE", "stylePrompt": "T2V prompt", "duration": 4} or null to skip.
"duration" is in seconds (3-5). Pick based on content pacing: 3s for fast/hype, 5s for cinematic/slow.
The stylePrompt describes the visual: particles, lights, motion — matched to the creative direction.
IMPORTANT: The video is rendered in 9:16 PORTRAIT format (1080x1920, very tall and narrow).
Text MUST fit within the narrow frame. In the stylePrompt:
- ALWAYS include "small centered text, compact, fits within narrow portrait frame"
- NEVER use "large text", "bold title", "big letters", or "fullscreen text"
- Keep the "text" field to 2-4 words MAX (e.g. "Game Day", "Our Wedding", "Summer 2025")
- If the title is longer, abbreviate it — the text must be SHORT to fit the vertical frame
- Prefer abstract motion backgrounds (particles, gradients, light leaks) with minimal text overlay
DEFAULT TO null (no intro) in most cases. Intros are only justified for:
  - Long tapes (8+ clips) that benefit from a title card to set the mood
  - Event/occasion content (weddings, graduations, game days) where a title adds context
  - User explicitly requested an intro in their creative direction
SKIP intro (set null) for:
  - Small collections (≤6 clips/photos) — the content speaks for itself
  - Art, product, or aesthetic collections — jump straight into the visuals
  - Any tape under 30 seconds total — an intro eats too much runtime
  - When no clear title/theme exists beyond "look at these"

OUTRO CARD — A matching closing card appended after the last clip.
Set "outro" to {"text": "CLOSING", "stylePrompt": "T2V prompt", "duration": 4} or null to skip.
Same 9:16 portrait text rules as intro — 2-4 words max, "small centered text" in stylePrompt, fits narrow vertical frame.
"duration" 3-5 seconds, match the intro's pacing.
DEFAULT TO null. Only add an outro if the tape is long (8+ clips) AND has a clear closing message.
Most tapes should NOT have an outro.

SOUND EFFECTS — Transition whooshes, impact hits, crowd accents.
Set "sfx" to an array of cues: {clipIndex, timing: "before"|"on"|"after", prompt, durationMs: 500-5000}.
Use an empty array [] if SFX would clutter the content (e.g. calm/cinematic content).
When used, match SFX style to content mood. 2-6 cues max — quality over quantity.

VOICEOVER — AI-generated narration on key moments.
Set "voiceover": {enabled: true/false, segments: [{clipIndex, text}], voiceCharacter: "male-broadcaster-hype"|"male-narrator-warm"|"male-young-energetic"|"female-narrator-warm"|"female-broadcaster-hype"|"female-young-energetic", delaySec: 0.3}.
"delaySec" (0-1s): delay before voiceover starts after clip begins. Use 0 for immediate, 0.3 for natural pause, 0.5-1 for dramatic reveals.
Set enabled: false if narration would feel intrusive (most content doesn't need voiceover).
When enabled, 2-4 segments max. Less is more — narrate only pivotal moments.
Choose voice character that matches the content's energy and audience.

MUSIC — AI instrumental soundtrack.
Set "musicPrompt" (genre, energy, instruments, mood, tempo). Set "musicDurationMs" to total tape length in ms.
Be specific about instrumentation and energy arc, not generic. The music should feel custom-scored.

AUDIO MIX — Fine-tune the volume balance for the entire tape.
Set "musicVolume" (0-1): background music level. 0.3 for VO-heavy, 0.5 normal, 0.7 for music-driven.
Set "sfxVolume" (0-1): sound effects level. 0.6 for subtle, 0.8 normal, 1.0 for punchy/hype.
Set "voiceoverVolume" (0-1): narration level. 0.8 for subtle, 1.0 normal.
These let you create the perfect mix for the content — e.g. a music video needs loud music + quiet VO, while a narrated recap needs loud VO + quiet music.

DEFAULT TRANSITION DURATION — Fallback for clips that don't specify their own.
Set "defaultTransitionDuration" (0.1-1.0 seconds). 0.15 for fast/punchy edits, 0.3 for standard, 0.5-0.8 for cinematic/dreamy.
Match to the overall pacing and energy of the content.

THUMBNAIL — Best frame for social sharing.
Set "thumbnail": {sourceClipIndex, frameTime, stylePrompt} or null.

STYLE TRANSFER — Optional visual post-processing look applied to the entire tape.
Set "styleTransfer": {"prompt": "cinematic film grain, warm tones, subtle vignette", "strength": 0.4} or null.
Only use when a specific look would elevate the content (cinematic, neon, vintage, etc.).
null means no post-processing — the per-clip filters are enough. Most content should be null.

TALKING HEAD INTRO — If a voice clone sample is provided, write a short intro speech (5-10 words).
Set "talkingHeadSpeech": "What's up everyone, check out these highlights!" or null.
null if no voice sample was provided or a talking head intro doesn't fit the content.

Respond with ONLY a JSON object:
{"contentSummary": "vivid description", "theme": "label", "clips": [{"sourceFileId": "...", "startTime": 0, "endTime": 5, "label": "brief description", "confidenceScore": 0.9, "velocityKeyframes": [{"position": 0, "speed": 2.0}, {"position": 0.35, "speed": 0.3}, {"position": 0.6, "speed": 0.3}, {"position": 1, "speed": 1.5}], "transitionType": "zoom_punch", "transitionDuration": 0.3, "filterCSS": "saturate(1.3) contrast(1.2) brightness(0.98)", "entryPunchScale": 1.04, "entryPunchDuration": 0.15, "captionText": "no way.", "captionAnimation": "pop", "captionFontWeight": 900, "captionColor": "#ffffff", "captionGlowColor": "#7c3aed", "captionGlowRadius": 15, "kenBurnsIntensity": 0}], "intro": {"text": "TITLE TEXT", "stylePrompt": "cinematic reveal description", "duration": 4}, "outro": {"text": "CLOSING TEXT", "stylePrompt": "matching outro description", "duration": 3}, "sfx": [{"clipIndex": 0, "timing": "before", "prompt": "sound description", "durationMs": 1500}], "voiceover": {"enabled": true, "segments": [{"clipIndex": 0, "text": "Watch this."}], "voiceCharacter": "male-broadcaster-hype", "delaySec": 0.3}, "musicPrompt": "genre and mood description for instrumental", "musicDurationMs": 30000, "musicVolume": 0.5, "sfxVolume": 0.8, "voiceoverVolume": 1.0, "defaultTransitionDuration": 0.3, "thumbnail": {"sourceClipIndex": 2, "frameTime": 3.5, "stylePrompt": "thumbnail style description"}, "styleTransfer": null, "talkingHeadSpeech": null}`;

  // Build a multimodal message: show the planner the actual frames
  const userContent: Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }> = [];

  // Build a score lookup so we can annotate each frame with its score + label
  const scoreLookup = new Map<string, ScoredFrame>();
  for (const s of scores) {
    scoreLookup.set(frameKey(s.sourceFileId, s.timestamp), s);
  }

  userContent.push({
    type: "text",
    text: `Here are ${plannerFrames.length} frames from ${sourceFiles.size} source files.\nStudy every single frame — the composition, lighting, emotion, motion, story. Each frame is annotated with its virality score and analysis from the scoring pass. Understand the content deeply before you make any editing decisions.\n`,
  });

  for (const frame of plannerFrames) {
    userContent.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: frame.base64 },
    });

    const scoreData = scoreLookup.get(frameKey(frame.sourceFileId, frame.timestamp));
    const approxDuration = (sourceDurations.get(frame.sourceFileId) ?? 0) + 2;
    const position = approxDuration > 0
      ? `${((frame.timestamp / approxDuration) * 100).toFixed(0)}% through`
      : "start";

    const audioVal = frame.audioEnergy != null ? ` | AUDIO: ${frame.audioEnergy.toFixed(2)}` : "";
    const onsetVal = frame.audioOnset != null && frame.audioOnset > 0.1 ? ` | ONSET: ${frame.audioOnset.toFixed(2)}` : "";
    const specVal = (frame.audioBass != null && frame.audioEnergy != null && frame.audioEnergy > 0.1) ? ` | SPECTRUM: B${frame.audioBass.toFixed(2)}/M${(frame.audioMid ?? 0).toFixed(2)}/T${(frame.audioTreble ?? 0).toFixed(2)}` : "";
    let annotation = `↑ "${frame.sourceFileName}" (${frame.sourceType}), fileID: ${frame.sourceFileId}, t=${frame.timestamp.toFixed(1)}s (${position})${audioVal}${onsetVal}${specVal}`;
    if (scoreData) {
      const roleTag = scoreData.narrativeRole ? ` [${scoreData.narrativeRole}]` : "";
      annotation += ` | SCORE: ${scoreData.score.toFixed(2)}${roleTag} | "${scoreData.label}"`;
    }
    userContent.push({ type: "text", text: annotation });
  }

  userContent.push({
    type: "text",
    text: `\nYou've now seen ALL the footage. Think deeply:\n- What's the story across these ${sourceCount} sources?\n- What are the cross-source connections? (cause→effect, before→after, matching energy)\n- What's the emotional arc?\n- What would make this reel go VIRAL on Instagram — maximum watch-through, saves, shares, and replays?${
      userFeedback
        ? `\n\nDIRECTOR'S NOTE — The user has specific creative direction that takes PRIORITY:\n"${userFeedback}"\nHonor this direction in every creative decision. This is a regeneration — make a DIFFERENT edit than before.`
        : ""
    }${
      creativeDirection
        ? `\n\nSTYLE DIRECTION — The user wants a specific look and feel:\n"${creativeDirection}"\nApply this style across all clips: colors, mood, pacing, effects, filters, captions, transitions — everything should reflect this direction.`
        : ""
    }\n\nNow create the highlight tape.`,
  });

  debugLog(`[Planner] Sending request — ${userContent.length} content blocks, model=claude-opus-4-6, effort=medium`);
  const plannerStartMs = Date.now();

  const response = await fetchWithRetry(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 32000,
        stream: true,
        thinking: {
          type: "adaptive",
        },
        output_config: {
          effort: "medium",
        },
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userContent }],
      }),
    },
    "Planner"
  );

  debugLog(`[Planner] Got HTTP ${response.status} in ${((Date.now() - plannerStartMs) / 1000).toFixed(1)}s`);

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Planner API error (HTTP ${response.status}): ${errorBody.slice(0, 200)}`);
  }

  // Consume SSE stream — streaming prevents HTTP timeout on long thinking requests
  // Pass onPartial to extract production plan fields early for pre-emptive generator start
  const { text, stopReason } = await consumeSSEStream(response, onPhase, onPartial);

  if (stopReason === "max_tokens") {
    console.warn("Planner: response was truncated (max_tokens reached) — JSON may be incomplete");
  }

  if (!text) {
    console.error(`Planner: no text content from stream. stop_reason=${stopReason}`);
    throw new Error(`Planner: no text content (stop_reason=${stopReason})`);
  }

  // Try to parse as the new object format: {"contentSummary": "...", "theme": "...", "clips": [...]}
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    const parsed = JSON.parse(objMatch[0]) as {
        contentSummary?: string;
        theme?: string;
        clips?: Array<{
          sourceFileId: string;
          startTime: number;
          endTime: number;
          label: string;
          confidenceScore: number;
          velocityPreset?: string;
          transitionType?: string;
          transitionDuration?: number;
          filter?: string;
          captionText?: string;
          captionStyle?: string;
          entryPunchScale?: number;
          entryPunchDuration?: number;
          kenBurnsIntensity?: number;
          // Dynamic AI-authored styles
          velocityKeyframes?: Array<{ position: number; speed: number }>;
          filterCSS?: string;
          // Dynamic AI-authored caption styling
          captionFontWeight?: number;
          captionFontStyle?: string;
          captionFontFamily?: string;
          captionColor?: string;
          captionAnimation?: string;
          captionGlowColor?: string;
          captionGlowRadius?: number;
          animationPrompt?: string;
        }>;
        // AI Production plan fields
        intro?: { text: string; stylePrompt: string } | null;
        outro?: { text: string; stylePrompt: string } | null;
        sfx?: Array<{ clipIndex: number; timing: string; prompt: string; durationMs: number }>;
        voiceover?: { enabled: boolean; segments: Array<{ clipIndex: number; text: string }>; voiceCharacter: string };
        musicPrompt?: string;
        musicDurationMs?: number;
        thumbnail?: { sourceClipIndex: number; frameTime: number; stylePrompt: string } | null;
        styleTransfer?: { prompt: string; strength: number } | null;
        talkingHeadSpeech?: string | null;
      };

      if (!parsed.contentSummary) {
        console.warn("Planner: AI returned no contentSummary");
      }
      const contentSummary = parsed.contentSummary ?? "";

      const theme: DetectedTheme =
        parsed.theme && VALID_THEMES.includes(parsed.theme as DetectedTheme)
          ? (parsed.theme as DetectedTheme)
          : "cinematic";
      if (parsed.theme && !VALID_THEMES.includes(parsed.theme as DetectedTheme)) {
        console.warn(`Planner: unrecognized theme "${parsed.theme}", falling back to "cinematic"`);
      }

      const VALID_VELOCITIES = ["normal", "hero", "bullet", "ramp_in", "ramp_out", "montage"];
      const VALID_TRANSITIONS = [
        "flash", "zoom_punch", "whip", "hard_flash", "glitch",
        "crossfade", "light_leak", "soft_zoom",
        "color_flash", "strobe", "hard_cut", "dip_to_black",
      ];
      const VALID_FILTERS = [
        "None", "Vibrant", "Warm", "Cool", "Noir", "Fade",
        "GoldenHour", "TealOrange", "MoodyCinematic", "CleanAiry", "VintageFilm",
      ];
      const VALID_CAPTION_STYLES = ["Bold", "Minimal", "Neon", "Classic"];

      if (!Array.isArray(parsed.clips) || parsed.clips.length === 0) {
        console.warn("Planner: AI returned no clips array or empty clips");
        return { clips: [], detectedTheme: theme, contentSummary };
      }

      const clips = parsed.clips.filter((p, i) => {
        // Validate required fields
        if (!p.sourceFileId || typeof p.startTime !== "number" || typeof p.endTime !== "number") {
          console.warn(`Planner: clip ${i} missing required fields, skipping`);
          return false;
        }
        // Validate time range
        if (p.startTime >= p.endTime) {
          console.warn(`Planner: clip ${i} has startTime (${p.startTime}) >= endTime (${p.endTime}), skipping`);
          return false;
        }
        // Minimum clip duration guard — clips under 2s feel like errors
        const MIN_CLIP_DURATION_S = 2.0;
        if (p.endTime - p.startTime < MIN_CLIP_DURATION_S) {
          console.warn(`Planner: clip ${i} too short (${(p.endTime - p.startTime).toFixed(2)}s < ${MIN_CLIP_DURATION_S}s), skipping`);
          return false;
        }
        return true;
      }).map((p, i) => {
        if (p.velocityPreset && !VALID_VELOCITIES.includes(p.velocityPreset)) {
          console.warn(`Planner: clip ${i} unrecognized velocity "${p.velocityPreset}", defaulting to "normal"`);
        }
        if (p.filter && !VALID_FILTERS.includes(p.filter)) {
          console.warn(`Planner: clip ${i} unrecognized filter "${p.filter}", dropping`);
        }

        // Validate custom velocity keyframes from AI
        let customVelocityKeyframes: Array<{ position: number; speed: number }> | undefined;
        if (Array.isArray(p.velocityKeyframes) && p.velocityKeyframes.length >= 2) {
          const valid = p.velocityKeyframes.every((kf: { position?: number; speed?: number }) =>
            typeof kf.position === "number" && typeof kf.speed === "number" &&
            kf.position >= 0 && kf.position <= 1 && kf.speed >= 0.1 && kf.speed <= 5.0
          );
          if (valid) {
            customVelocityKeyframes = p.velocityKeyframes
              .map((kf: { position: number; speed: number }) => ({
                position: kf.position,
                speed: Math.max(0.1, Math.min(5.0, kf.speed)),
              }))
              .sort((a: { position: number }, b: { position: number }) => a.position - b.position);
          } else {
            console.warn(`Planner: clip ${i} invalid velocityKeyframes, ignoring`);
          }
        }

        // Validate custom CSS filter string — allow only safe CSS filter functions
        let customFilterCSS: string | undefined;
        if (typeof p.filterCSS === "string" && p.filterCSS.trim()) {
          const safeFilterPattern = /^(\s*(saturate|contrast|brightness|sepia|hue-rotate|grayscale|blur|invert|opacity)\([^)]+\)\s*)+$/i;
          if (safeFilterPattern.test(p.filterCSS.trim())) {
            customFilterCSS = p.filterCSS.trim();
          } else {
            console.warn(`Planner: clip ${i} unsafe filterCSS "${p.filterCSS.slice(0, 60)}", ignoring`);
          }
        }

        return {
        id: crypto.randomUUID(),
        sourceFileId: p.sourceFileId,
        startTime: Math.max(0, p.startTime),
        endTime: Math.max(0, p.endTime),
        confidenceScore: Math.max(0, Math.min(1, Number(p.confidenceScore) || 0.5)),
        label: p.label || "Highlight",
        velocityPreset: (p.velocityPreset && VALID_VELOCITIES.includes(p.velocityPreset))
          ? p.velocityPreset
          : "normal",
        order: i,
        // Per-clip visual style from AI
        transitionType: (p.transitionType && VALID_TRANSITIONS.includes(p.transitionType))
          ? p.transitionType : undefined,
        transitionDuration: (typeof p.transitionDuration === "number" && p.transitionDuration >= 0.1 && p.transitionDuration <= 2.0)
          ? p.transitionDuration : undefined,
        filter: (p.filter && VALID_FILTERS.includes(p.filter))
          ? p.filter : undefined,
        captionText: p.captionText || undefined,
        captionStyle: (p.captionStyle && VALID_CAPTION_STYLES.includes(p.captionStyle))
          ? p.captionStyle : undefined,
        entryPunchScale: (typeof p.entryPunchScale === "number" && p.entryPunchScale >= 1.0 && p.entryPunchScale <= 1.1)
          ? p.entryPunchScale : undefined,
        entryPunchDuration: (typeof p.entryPunchDuration === "number" && p.entryPunchDuration >= 0 && p.entryPunchDuration <= 0.5)
          ? p.entryPunchDuration : undefined,
        kenBurnsIntensity: (typeof p.kenBurnsIntensity === "number" && p.kenBurnsIntensity >= 0 && p.kenBurnsIntensity <= 0.15)
          ? p.kenBurnsIntensity : undefined,
        // Dynamic AI-authored styles
        customVelocityKeyframes,
        customFilterCSS,
        // Dynamic AI-authored caption styling
        customCaptionFontWeight: (typeof p.captionFontWeight === "number" && p.captionFontWeight >= 100 && p.captionFontWeight <= 900)
          ? p.captionFontWeight : undefined,
        customCaptionFontStyle: (p.captionFontStyle === "italic" || p.captionFontStyle === "normal")
          ? p.captionFontStyle : undefined,
        customCaptionFontFamily: (p.captionFontFamily === "sans-serif" || p.captionFontFamily === "serif" || p.captionFontFamily === "mono")
          ? p.captionFontFamily : undefined,
        customCaptionColor: (typeof p.captionColor === "string" && /^#[0-9a-fA-F]{6}$/.test(p.captionColor))
          ? p.captionColor : undefined,
        customCaptionAnimation: (typeof p.captionAnimation === "string" && ["pop", "slide", "flicker", "typewriter", "fade", "none"].includes(p.captionAnimation))
          ? p.captionAnimation : undefined,
        customCaptionGlowColor: (typeof p.captionGlowColor === "string" && /^#[0-9a-fA-F]{6}$/.test(p.captionGlowColor))
          ? p.captionGlowColor : undefined,
        customCaptionGlowRadius: (typeof p.captionGlowRadius === "number" && p.captionGlowRadius >= 0 && p.captionGlowRadius <= 30)
          ? p.captionGlowRadius : undefined,
        // Photo animation prompt from AI
        animationPrompt: (typeof p.animationPrompt === "string" && p.animationPrompt.trim())
          ? p.animationPrompt.trim().slice(0, 500) : undefined,
      }; });

      // Deduplicate: drop clips with identical or overlapping time ranges from the same source
      const uniqueClips: typeof clips = [];
      for (const clip of clips) {
        // Check for overlap with already-accepted clips from the same source
        const dominated = uniqueClips.some((existing) => {
          if (existing.sourceFileId !== clip.sourceFileId) return false;
          // Compute overlap between existing and candidate
          const overlapStart = Math.max(existing.startTime, clip.startTime);
          const overlapEnd = Math.min(existing.endTime, clip.endTime);
          const overlap = Math.max(0, overlapEnd - overlapStart);
          const candidateDuration = clip.endTime - clip.startTime;
          // Drop if >50% of the candidate's duration overlaps an existing clip
          return candidateDuration > 0 && overlap / candidateDuration > 0.5;
        });
        if (dominated) {
          console.warn(
            `Planner: dropping overlapping clip ${clip.sourceFileId} [${clip.startTime}-${clip.endTime}]`
          );
          continue;
        }
        uniqueClips.push(clip);
      }

      // Enforce minimum temporal gap between clips from the same source.
      // Clips that are too close (within 5s) to an already-accepted clip get dropped.
      const MIN_CLIP_GAP_S = 5;
      const MAX_CLIPS_PER_SOURCE = 6;
      const spacedClips: typeof uniqueClips = [];
      const sourceClipCount = new Map<string, number>();
      for (const clip of uniqueClips) {
        // Cap clips per source to prevent visual repetition
        const srcCount = sourceClipCount.get(clip.sourceFileId) ?? 0;
        if (srcCount >= MAX_CLIPS_PER_SOURCE) {
          console.warn(
            `Planner: dropping clip ${clip.sourceFileId} [${clip.startTime.toFixed(1)}-${clip.endTime.toFixed(1)}] — max ${MAX_CLIPS_PER_SOURCE} clips per source reached`
          );
          continue;
        }
        const tooClose = spacedClips.some((existing) => {
          if (existing.sourceFileId !== clip.sourceFileId) return false;
          // Check gap between the clips (gap = space between one's end and other's start)
          const gap = Math.min(
            Math.abs(clip.startTime - existing.endTime),
            Math.abs(existing.startTime - clip.endTime)
          );
          return gap < MIN_CLIP_GAP_S;
        });
        if (tooClose) {
          console.warn(
            `Planner: dropping clip ${clip.sourceFileId} [${clip.startTime.toFixed(1)}-${clip.endTime.toFixed(1)}] — too close to existing clip from same source (min gap: ${MIN_CLIP_GAP_S}s)`
          );
          continue;
        }
        spacedClips.push(clip);
        sourceClipCount.set(clip.sourceFileId, srcCount + 1);
      }

      // Extract AI production plan from Claude's output
      const VALID_SFX_TIMINGS = ["before", "on", "after"];
      const VALID_VOICE_CHARS = [
        "male-broadcaster-hype", "male-narrator-warm", "male-young-energetic",
        "female-narrator-warm", "female-broadcaster-hype", "female-young-energetic",
      ];

      const productionPlan: ProductionPlan = {
        intro: (parsed.intro && typeof parsed.intro.text === "string" && typeof parsed.intro.stylePrompt === "string")
          ? {
              text: parsed.intro.text.slice(0, 200),
              stylePrompt: parsed.intro.stylePrompt.slice(0, 500),
              duration: typeof parsed.intro.duration === "number" ? Math.max(3, Math.min(5, parsed.intro.duration)) : 4,
            }
          : null,
        outro: (parsed.outro && typeof parsed.outro.text === "string" && typeof parsed.outro.stylePrompt === "string")
          ? {
              text: parsed.outro.text.slice(0, 200),
              stylePrompt: parsed.outro.stylePrompt.slice(0, 500),
              duration: typeof parsed.outro.duration === "number" ? Math.max(3, Math.min(5, parsed.outro.duration)) : 4,
            }
          : null,
        sfx: Array.isArray(parsed.sfx)
          ? parsed.sfx
              .filter((s) =>
                typeof s.clipIndex === "number" &&
                s.clipIndex >= 0 && s.clipIndex < spacedClips.length &&
                VALID_SFX_TIMINGS.includes(s.timing) &&
                typeof s.prompt === "string" && s.prompt.trim().length > 0 &&
                typeof s.durationMs === "number" && Number.isFinite(s.durationMs)
              )
              .slice(0, 12)
              .map((s) => ({
                clipIndex: s.clipIndex,
                timing: s.timing,
                prompt: s.prompt.slice(0, 300),
                durationMs: Math.max(500, Math.min(5000, s.durationMs)),
              }))
          : [],
        voiceover: (parsed.voiceover && typeof parsed.voiceover.enabled === "boolean")
          ? {
              enabled: parsed.voiceover.enabled,
              segments: Array.isArray(parsed.voiceover.segments)
                ? parsed.voiceover.segments
                    .filter((seg) => typeof seg.clipIndex === "number" && seg.clipIndex >= 0 && seg.clipIndex < spacedClips.length && typeof seg.text === "string" && seg.text.trim().length > 0)
                    .slice(0, 8)
                    .map((seg) => ({ clipIndex: seg.clipIndex, text: seg.text.slice(0, 200) }))
                : [],
              voiceCharacter: VALID_VOICE_CHARS.includes(parsed.voiceover.voiceCharacter)
                ? parsed.voiceover.voiceCharacter
                : "male-broadcaster-hype",
              delaySec: typeof parsed.voiceover.delaySec === "number"
                ? Math.max(0, Math.min(1, parsed.voiceover.delaySec))
                : 0.3,
            }
          : { enabled: false, segments: [], voiceCharacter: "male-broadcaster-hype", delaySec: 0.3 },
        musicPrompt: typeof parsed.musicPrompt === "string" ? parsed.musicPrompt.slice(0, 500) : "",
        musicDurationMs: (() => {
          // Compute total tape duration from clips so music always covers the full video
          const tapeDurationMs = spacedClips.reduce(
            (sum, c) => sum + (c.endTime - c.startTime) * 1000, 0
          );
          const floor = Math.max(3000, tapeDurationMs);
          if (typeof parsed.musicDurationMs === "number") {
            // Use the AI value but never shorter than the tape itself
            return Math.max(floor, Math.min(300000, parsed.musicDurationMs));
          }
          return Math.min(300000, Math.max(floor, 60000));
        })(),
        musicVolume: typeof parsed.musicVolume === "number" ? Math.max(0, Math.min(1, parsed.musicVolume)) : 0.5,
        sfxVolume: typeof parsed.sfxVolume === "number" ? Math.max(0, Math.min(1, parsed.sfxVolume)) : 0.8,
        voiceoverVolume: typeof parsed.voiceoverVolume === "number" ? Math.max(0, Math.min(1, parsed.voiceoverVolume)) : 1.0,
        defaultTransitionDuration: typeof parsed.defaultTransitionDuration === "number" ? Math.max(0.1, Math.min(1.0, parsed.defaultTransitionDuration)) : 0.3,
        thumbnail: (parsed.thumbnail && typeof parsed.thumbnail.sourceClipIndex === "number" && parsed.thumbnail.sourceClipIndex >= 0 && parsed.thumbnail.sourceClipIndex < spacedClips.length)
          ? {
              sourceClipIndex: parsed.thumbnail.sourceClipIndex,
              frameTime: typeof parsed.thumbnail.frameTime === "number" ? Math.max(0, parsed.thumbnail.frameTime) : 0,
              stylePrompt: typeof parsed.thumbnail.stylePrompt === "string" ? parsed.thumbnail.stylePrompt.slice(0, 300) : "",
            }
          : null,
        styleTransfer: (parsed.styleTransfer && typeof parsed.styleTransfer.prompt === "string")
          ? {
              prompt: parsed.styleTransfer.prompt.slice(0, 500),
              strength: typeof parsed.styleTransfer.strength === "number"
                ? Math.max(0.1, Math.min(1.0, parsed.styleTransfer.strength))
                : 0.5,
            }
          : null,
        talkingHeadSpeech: typeof parsed.talkingHeadSpeech === "string"
          ? parsed.talkingHeadSpeech.slice(0, 200)
          : null,
      };

      debugLog(`[Planner] Production plan: intro=${!!productionPlan.intro}, outro=${!!productionPlan.outro}, sfx=${productionPlan.sfx.length}, voiceover=${productionPlan.voiceover.enabled ? productionPlan.voiceover.segments.length + " segments" : "disabled"}, music=${productionPlan.musicPrompt.length > 0 ? "yes" : "no"}, thumbnail=${!!productionPlan.thumbnail}`);

      return { clips: spacedClips, detectedTheme: theme, contentSummary, productionPlan };
  }

  throw new Error("Planner response could not be parsed as JSON");
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── Batch API scoring (50% cost savings) ────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Manifest entry — lightweight metadata (no base64) for mapping batch results
 * back to ScoredFrame objects after retrieval.
 */
export interface ScoringBatchManifestEntry {
  customId: string;
  frames: Array<{
    sourceFileId: string;
    sourceType: "video" | "photo";
    timestamp: number;
  }>;
}

/**
 * Submit ALL scoring batches to the Anthropic Batch API in a single request.
 * Returns a batchId for polling and a manifest for result parsing.
 *
 * Cost: 50% off all input/output tokens vs real-time API.
 * Tradeoff: async processing — most batches finish in <1 hour.
 */
export async function submitScoringBatch(
  allBatches: MultiFrameInput[][],
  sourceFileList: SourceFileInfo[],
  templateName?: string
): Promise<{ batchId: string; manifest: ScoringBatchManifestEntry[] }> {
  "use server";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const sourceFiles = new Map(
    sourceFileList.map((s) => [s.id, { name: s.name, type: s.type, frameCount: s.frameCount }])
  );
  const systemPrompt = buildScoringSystemPrompt(sourceFiles, templateName);

  // Build one Batch API request per scoring batch
  const requests = allBatches.map((batch, i) => ({
    custom_id: `score-batch-${i}`,
    params: {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16000,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: buildScoringContent(batch) }],
    },
  }));

  // Build lightweight manifest (no base64) for mapping results → ScoredFrame
  const manifest: ScoringBatchManifestEntry[] = allBatches.map((batch, i) => ({
    customId: `score-batch-${i}`,
    frames: batch.map((f) => ({
      sourceFileId: f.sourceFileId,
      sourceType: f.sourceType,
      timestamp: f.timestamp,
    })),
  }));

  const response = await fetchWithRetry(
    "https://api.anthropic.com/v1/messages/batches",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ requests }),
    },
    "Batch submit"
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Batch submit failed (HTTP ${response.status}): ${errorBody.slice(0, 300)}`);
  }

  const data = await response.json();
  return { batchId: data.id, manifest };
}

/**
 * Poll a scoring batch for completion.
 */
export async function pollScoringBatch(batchId: string): Promise<{
  status: "in_progress" | "ended" | "canceling" | "expired";
  counts: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
  resultsUrl: string | null;
}> {
  "use server";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const response = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Batch poll failed (HTTP ${response.status}): ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  return {
    status: data.processing_status,
    counts: data.request_counts ?? {
      processing: 0,
      succeeded: 0,
      errored: 0,
      canceled: 0,
      expired: 0,
    },
    resultsUrl: data.results_url ?? null,
  };
}

/**
 * Retrieve and parse all results from a completed scoring batch.
 * The manifest maps custom_ids back to frame metadata for ScoredFrame construction.
 */
export async function retrieveScoringResults(
  batchId: string,
  manifest: ScoringBatchManifestEntry[]
): Promise<ScoredFrame[]> {
  "use server";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  // Fetch JSONL results
  const response = await fetch(
    `https://api.anthropic.com/v1/messages/batches/${batchId}/results`,
    {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Batch results fetch failed (HTTP ${response.status}): ${errorBody.slice(0, 200)}`);
  }

  // Parse JSONL — each line is a complete JSON object
  const text = await response.text();
  const lines = text.split("\n").filter((l) => l.trim());

  const manifestMap = new Map(manifest.map((m) => [m.customId, m]));
  const allScores: ScoredFrame[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as {
        custom_id: string;
        result: {
          type: "succeeded" | "errored" | "canceled" | "expired";
          message?: { content: Array<{ type: string; text?: string }>; stop_reason?: string };
          error?: { type: string; message: string };
        };
      };

      if (entry.result.type !== "succeeded" || !entry.result.message) {
        console.warn(`Batch result ${entry.custom_id}: ${entry.result.type}`, entry.result.error);
        continue;
      }

      if (entry.result.message.stop_reason === "max_tokens") {
        console.warn(`Batch result ${entry.custom_id}: truncated (max_tokens)`);
      }

      const manifestEntry = manifestMap.get(entry.custom_id);
      if (!manifestEntry) {
        console.warn(`Batch result ${entry.custom_id}: no manifest entry, skipping`);
        continue;
      }

      // Extract text from response content
      const textBlock = entry.result.message.content.find((b) => b.type === "text");
      if (!textBlock?.text) {
        console.warn(`Batch result ${entry.custom_id}: no text block`);
        continue;
      }

      // Parse JSON array from text
      const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn(`Batch result ${entry.custom_id}: unparsable response`);
        continue;
      }

      const parsed = safeParseJSONArray(jsonMatch[0]) as Array<{
        index: number;
        score: number;
        label: string;
        role?: string;
      }>;

      if (!Array.isArray(parsed)) continue;

      for (const p of parsed) {
        if (!Number.isInteger(p.index) || p.index < 0 || p.index >= manifestEntry.frames.length) continue;
        if (typeof p.score !== "number" || isNaN(p.score)) continue;

        const frame = manifestEntry.frames[p.index];
        allScores.push({
          sourceFileId: frame.sourceFileId,
          sourceType: frame.sourceType,
          timestamp: frame.timestamp,
          score: Math.max(0, Math.min(1, p.score)),
          label: p.label || "highlight",
          narrativeRole: (p.role && VALID_ROLES.includes(p.role)) ? p.role : undefined,
        });
      }
    } catch (err) {
      console.warn("Batch result parse error:", err);
    }
  }

  return allScores;
}

