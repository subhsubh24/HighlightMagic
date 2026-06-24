"use server";

import type { SourceFileInfo } from "@/lib/frame-batching";
import { getEffectiveDuration } from "@/lib/velocity";
import type { VelocityPreset } from "@/lib/velocity";
import { CLAUDE_FRAME_SCORER, CLAUDE_PLANNER, estimateCostUSD } from "@/lib/ai-models";

// ── Debug logging ──

const DEBUG = process.env.NODE_ENV === "development" || process.env.DEBUG_DETECT === "1";
/** Debug-only logger — gated behind NODE_ENV or DEBUG_DETECT flag to avoid production noise. */
function debugLog(...args: unknown[]) {
  if (DEBUG) console.log(...args);
}

// ── API helpers ──

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
  const fetchStart = Date.now();
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const fetchInit = timeoutMs
        ? { ...init, signal: AbortSignal.timeout(timeoutMs) }
        : init;
      const attemptStart = Date.now();
      const response = await fetch(url, fetchInit);
      if (response.ok) {
        if (attempt > 0) {
          console.log(`${label}: succeeded on attempt ${attempt + 1} after ${((Date.now() - fetchStart) / 1000).toFixed(1)}s total`);
        }
        return response;
      }

      // Only retry on rate-limit (429) or overloaded (529)
      if (response.status === 429 || response.status === 529) {
        const retryAfter = response.headers.get("retry-after");
        const retryAfterSec = retryAfter ? parseFloat(retryAfter) : NaN;
        const rawWaitMs = !isNaN(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec * 1000
          : INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        const waitMs = Math.min(rawWaitMs, MAX_RETRY_WAIT_MS);
        console.warn(`${label}: HTTP ${response.status} (${response.status === 429 ? "rate-limited" : "overloaded"}), attempt ${attempt + 1}/${MAX_RETRIES}, waiting ${Math.round(waitMs)}ms (elapsed ${((Date.now() - fetchStart) / 1000).toFixed(1)}s)`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      // Non-retryable HTTP error — return as-is
      console.error(`${label}: non-retryable HTTP ${response.status} after ${((Date.now() - attemptStart) / 1000).toFixed(1)}s`);
      return response;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "network error";
      if (attempt < MAX_RETRIES) {
        const waitMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(`${label}: ${errMsg}, attempt ${attempt + 1}/${MAX_RETRIES}, waiting ${waitMs}ms (elapsed ${((Date.now() - fetchStart) / 1000).toFixed(1)}s)`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      console.error(`${label}: all ${MAX_RETRIES} retries exhausted after ${((Date.now() - fetchStart) / 1000).toFixed(1)}s — last error: ${errMsg}`);
      throw err;
    }
  }
  // All retries exhausted — make one final attempt (will throw on failure)
  console.warn(`${label}: retries exhausted, making final attempt (elapsed ${((Date.now() - fetchStart) / 1000).toFixed(1)}s)`);
  const fetchInit = timeoutMs
    ? { ...init, signal: AbortSignal.timeout(timeoutMs) }
    : init;
  return fetch(url, fetchInit);
}

/**
 * Run async tasks with a concurrency limit.
 */
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
): Promise<{ text: string; stopReason: string | null; inputTokens: number; outputTokens: number }> {
  const streamStartMs = Date.now();
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let stopReason: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
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
        if (event.type === "message_start") {
          inputTokens = event.message?.usage?.input_tokens ?? 0;
        } else if (event.type === "content_block_start") {
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
          outputTokens = event.usage?.output_tokens ?? outputTokens;
        } else if (event.type === "error") {
          console.error(`[Planner SSE] Stream error event:`, JSON.stringify(event));
        }
      } catch (e) {
        console.warn("[Planner SSE] Unparseable SSE event:", line.slice(0, 100), e);
      }
    }
  }

  debugLog(`[Planner SSE] Stream complete — ${chunkCount} chunks, ${text.length} chars, stop_reason=${stopReason}, ${((Date.now() - streamStartMs) / 1000).toFixed(1)}s total`);
  return { text, stopReason, inputTokens, outputTokens };
}

// ── JSON extraction helpers ──

/**
 * Extract the outermost balanced JSON object or array from a string.
 * Unlike greedy regex `\{[\s\S]*\}`, this correctly handles cases where
 * the LLM writes prose after the JSON (e.g., "Here is the JSON: {...} Let me know if...").
 * The greedy regex would capture everything from first `{` to last `}` including the prose.
 */
function extractBalancedJSON(text: string, opener: "{" | "["): string | null {
  const closer = opener === "{" ? "}" : "]";
  const startIdx = text.indexOf(opener);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) return text.slice(startIdx, i + 1);
    }
  }
  // Unbalanced — fall back to greedy regex as last resort
  const fallbackPattern = opener === "{" ? /\{[\s\S]*\}/ : /\[[\s\S]*\]/;
  const m = text.match(fallbackPattern);
  return m ? m[0] : null;
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
    .replace(/(?<=":[ ]*"[^"\n]*)\n/g, " ")
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
    const bracketMatch = extractBalancedJSON(sanitized, "[");
    if (bracketMatch) {
      sanitized = bracketMatch
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
  cluster?: string; // duplicate photo cluster ID (e.g. "group_toast_1")
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
  captionExitAnimation?: string;
  // Per-clip audio & transition
  clipAudioVolume?: number;
  transitionIntensity?: number;
  beatPulseIntensity?: number;
  beatFlashOpacity?: number;
  beatFlashThreshold?: number;
  captionIdlePulse?: number;
  customCaptionGlowSpread?: number;
  audioFadeIn?: number;
  audioFadeOut?: number;
  captionAnimationIntensity?: number;
  // Photo animation — AI-generated motion prompt for Kling
  animationPrompt?: string;
}

export interface ProductionPlan {
  intro: { text: string; stylePrompt: string; duration: number } | null;
  outro: { text: string; stylePrompt: string; duration: number } | null;
  sfx: Array<{ clipIndex: number; timing: string; prompt: string; durationMs: number }>;
  voiceover: { enabled: boolean; segments: Array<{ clipIndex: number; text: string; delaySec?: number }>; voiceCharacter: string; delaySec: number };
  musicPrompt: string;
  musicDurationMs: number;
  musicVolume: number;
  sfxVolume: number;
  voiceoverVolume: number;
  defaultTransitionDuration: number;
  defaultEntryPunchScale?: number;
  defaultEntryPunchDuration?: number;
  defaultKenBurnsIntensity?: number;
  photoDisplayDuration: number;
  loopCrossfadeDuration: number;
  captionEntranceDuration: number;
  captionExitDuration: number;
  musicDuckRatio: number;
  musicDuckAttack?: number;
  musicDuckRelease?: number;
  musicFadeInDuration?: number;
  musicFadeOutDuration?: number;
  beatSyncToleranceMs: number;
  exportBitrate: number;
  watermarkOpacity: number;
  neonColors: string[];
  // Rendering fine-tuning (all optional — AI creative control)
  beatPulseIntensity?: number;
  beatFlashOpacity?: number;
  beatFlashThreshold?: number;
  beatFlashColor?: string;
  captionFontSize?: number;
  captionVerticalPosition?: number;
  captionShadowColor?: string;
  captionShadowBlur?: number;
  flashOverlayAlpha?: number;
  zoomPunchFlashAlpha?: number;
  colorFlashAlpha?: number;
  strobeFlashCount?: number;
  strobeFlashAlpha?: number;
  lightLeakColor?: string;
  glitchColors?: [string, string];
  letterboxColor?: string;
  captionExitAnimation?: string;
  watermarkColor?: string;
  grainBlockSize?: number;
  // Transition overlay fine-tuning
  lightLeakOpacity?: number;
  hardFlashDarkenPhase?: number;
  hardFlashBlastPhase?: number;
  glitchScanlineCount?: number;
  glitchBandWidth?: number;
  whipBlurLineCount?: number;
  whipBrightnessAlpha?: number;
  hardCutBumpAlpha?: number;
  // Kinetic text fine-tuning
  captionPopStartScale?: number;
  captionPopExitScale?: number;
  captionSlideExitDistance?: number;
  captionFadeExitOffset?: number;
  captionFlickerSpeed?: number;
  captionPopIdleFreq?: number;
  captionFlickerIdleFreq?: number;
  captionBoldSizeMultiplier?: number;
  captionMinimalSizeMultiplier?: number;
  captionPopOvershoot?: number;
  // Editing philosophy
  editingPhilosophy?: { vibe?: string; paceProfile?: string; transitionArc?: string; baseGrade?: string };
  // AI-controlled post-processing
  grainOpacity?: number;
  vignetteIntensity?: number;
  vignetteTightness?: number;
  vignetteHardness?: number;
  watermarkFontSize?: number;
  watermarkYOffset?: number;
  captionAppearDelay?: number;
  exitDecelSpeed?: number;
  exitDecelDuration?: number;
  settleScale?: number;
  settleDuration?: number;
  settleEasing?: string;
  exitDecelEasing?: string;
  clipAudioVolume?: number;
  finalClipWarmth?: boolean | { sepia: number; saturation: number; fadeIn: number };
  filmStock?: { grain: number; warmth: number; contrast: number; fadedBlacks: number };
  audioBreaths?: Array<{ time: number; duration: number; depth: number; attack?: number; release?: number }>;
  thumbnail: { sourceClipIndex: number; frameTime: number; stylePrompt: string } | null;
  styleTransfer: { prompt: string; strength: number } | null;
  talkingHeadSpeech: string | null;
}