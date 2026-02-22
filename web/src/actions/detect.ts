"use server";

import { MAX_FRAMES_PER_BATCH } from "@/lib/constants";
import type { SourceFileInfo } from "@/lib/frame-batching";

// ── API helpers ──

/** Max concurrent API calls — retry logic handles any 429s from the API */
const MAX_CONCURRENCY = 3;

/** Stagger delay between launching concurrent batches (ms).
 *  Prevents all workers from hitting the API at t=0, which triggers 429s. */
const BATCH_STAGGER_MS = 1500;

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
        const rawWaitMs = retryAfter
          ? parseFloat(retryAfter) * 1000
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

// ── Types ──

interface FrameInput {
  timestamp: number;
  base64: string;
}

interface MultiFrameInput {
  sourceFileId: string;
  sourceFileName: string;
  sourceType: "video" | "photo";
  timestamp: number;
  base64: string;
  audioEnergy?: number; // 0.0-1.0 normalized RMS energy at this timestamp
  audioOnset?: number;  // 0.0-1.0 energy delta — transient/beat strength
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
  kenBurnsIntensity?: number;
}

export interface DetectionResult {
  clips: DetectedClip[];
  detectedTheme: DetectedTheme;
  contentSummary: string;
}

// ── Legacy single-video detection (backward compat) ──

export async function detectHighlights(
  frames: FrameInput[],
  templateName?: string
): Promise<DetectionResult> {
  const multiFrames: MultiFrameInput[] = frames.map((f) => ({
    ...f,
    sourceFileId: "single",
    sourceFileName: "video",
    sourceType: "video" as const,
  }));
  return detectMultiClipHighlights(multiFrames, templateName);
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

/** @deprecated Use buildFrameBatches + scoreSingleBatch from the client instead. */
export async function scoreAllFrames(
  frames: MultiFrameInput[],
  templateName?: string
): Promise<ScoredFrame[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured. AI analysis requires a valid API key.");
  }

  const sourceFiles = buildSourceFilesMap(frames);

  // Batch frames BY SOURCE FILE so the AI sees temporal flow within each video.
  const framesBySource = new Map<string, MultiFrameInput[]>();
  for (const f of frames) {
    if (!framesBySource.has(f.sourceFileId)) framesBySource.set(f.sourceFileId, []);
    framesBySource.get(f.sourceFileId)!.push(f);
  }

  const batches: MultiFrameInput[][] = [];
  for (const [, sourceFrames] of framesBySource) {
    for (let i = 0; i < sourceFrames.length; i += MAX_FRAMES_PER_BATCH) {
      batches.push(sourceFrames.slice(i, i + MAX_FRAMES_PER_BATCH));
    }
  }

  const batchResults = await runWithConcurrency(
    batches.map((batch, i) => async () => {
      // Stagger batch starts so we don't slam the API at t=0 and trigger 429s
      if (i > 0) await new Promise((r) => setTimeout(r, i * BATCH_STAGGER_MS));
      return analyzeMultiBatch(apiKey, batch, sourceFiles, templateName);
    }),
    MAX_CONCURRENCY
  );
  return batchResults.flat();
}

// ── Phase 2: Plan highlights from scores ──

export async function planFromScores(
  frames: MultiFrameInput[],
  scores: ScoredFrame[],
  templateName?: string
): Promise<DetectionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured. AI analysis requires a valid API key.");
  }

  const sourceFiles = buildSourceFilesMap(frames);

  let planResult: { clips: DetectedClip[]; detectedTheme: DetectedTheme; contentSummary: string } | null = null;
  let lastPlanError: string | null = null;
  for (let planAttempt = 0; planAttempt < 3; planAttempt++) {
    try {
      const result = await planHighlightTape(apiKey, scores, frames, sourceFiles, templateName);
      if (result.clips.length > 0) {
        planResult = result;
        break;
      }
      lastPlanError = `returned 0 valid clips (scores: ${scores.length} frames from ${sourceFiles.size} sources)`;
      console.warn(`Planner ${lastPlanError} (attempt ${planAttempt + 1}/3), retrying...`);
    } catch (err) {
      lastPlanError = err instanceof Error ? err.message : String(err);
      console.warn(`Planner threw (attempt ${planAttempt + 1}/3): ${lastPlanError}`);
    }
    if (planAttempt < 2) {
      await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, planAttempt)));
    }
  }

  if (planResult && planResult.clips.length > 0) {
    return planResult;
  }

  throw new Error(`AI planner failed after 3 attempts: ${lastPlanError ?? "unknown error"}. Please try again.`);
}

// ── Multi-clip detection (convenience wrapper) ──

export async function detectMultiClipHighlights(
  frames: MultiFrameInput[],
  templateName?: string
): Promise<DetectionResult> {
  const scores = await scoreAllFrames(frames, templateName);
  return planFromScores(frames, scores, templateName);
}

/** Max batch-level retries (on top of HTTP-level retry in fetchWithRetry) */
const MAX_BATCH_RETRIES = 2;

/**
 * Score frames across multiple source files.
 * Retries the entire batch on failure before falling back.
 */
async function analyzeMultiBatch(
  apiKey: string,
  batch: MultiFrameInput[],
  sourceFiles: Map<string, { name: string; type: "video" | "photo"; frameCount: number }>,
  templateName?: string,
  attempt = 0
): Promise<ScoredFrame[]> {
  const sourceList = Array.from(sourceFiles.entries())
    .map(([id, info]) => `- "${info.name}" (${info.type}, ID: ${id})`)
    .join("\n");

  const systemPrompt = `You are a world-class Instagram Reels editor whose content averages 2M+ views.
You understand the PSYCHOLOGY of scrolling — what makes a thumb stop, what makes someone save,
what makes them share to their story, what makes them comment.

You're reviewing raw footage from ${sourceFiles.size} source files. Your job: deeply analyze
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
    content.push({
      type: "text",
      text: `Frame ${i} — source: "${frame.sourceFileName}" (${frame.sourceType}), fileID: ${frame.sourceFileId}, timestamp: ${frame.timestamp.toFixed(1)}s${audioTag}${onsetTag}`,
    });
  });

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
          model: "claude-sonnet-4-6",
          max_tokens: 16000,
          thinking: {
            type: "enabled",
            budget_tokens: 10000,
          },
          output_config: {
            effort: "high",
          },
          system: systemPrompt,
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

    // With extended thinking, response has thinking blocks + text blocks.
    // Safely extract the text block with a type guard.
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

    const VALID_ROLES = ["HOOK", "HERO", "REACTION", "RHYTHM", "CLOSER"];
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      index: number;
      score: number;
      label: string;
      role?: string;
    }>;

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
const API_MAX_IMAGES = 40; // Enough for planner to see top moments; 100 was causing 300s+ inference
const API_IMAGE_PAYLOAD_BUDGET = 10 * 1024 * 1024; // 10 MB budget (480p/0.7 frames are ~30-70KB each)
const API_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per image

function selectPlannerFrames(
  scores: ScoredFrame[],
  frames: MultiFrameInput[],
): MultiFrameInput[] {
  // Build a lookup from (sourceFileId, timestamp) → frame
  const frameLookup = new Map<string, MultiFrameInput>();
  for (const f of frames) {
    frameLookup.set(`${f.sourceFileId}::${f.timestamp.toFixed(1)}`, f);
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

  function addFrame(score: ScoredFrame): boolean {
    if (selected.length >= API_MAX_IMAGES) return false;
    const key = `${score.sourceFileId}::${score.timestamp.toFixed(1)}`;
    const frame = frameLookup.get(key);
    if (!frame || usedKeys.has(key)) return false;

    const frameBytes = frame.base64.length; // base64 string length ≈ bytes in JSON
    if (frameBytes > API_MAX_IMAGE_BYTES) return false; // skip oversized images
    if (totalBytes + frameBytes > API_IMAGE_PAYLOAD_BUDGET) return false; // would exceed budget

    selected.push(frame);
    usedKeys.add(key);
    totalBytes += frameBytes;
    return true;
  }

  // Phase 1: guarantee at least one frame per source (the best-scored one)
  for (const [, fileScores] of bySource) {
    if (fileScores.length > 0) addFrame(fileScores[0]);
  }

  // Phase 2: fill remaining budget with globally highest-scored frames
  const allSorted = [...scores].sort((a, b) => b.score - a.score);
  for (const s of allSorted) {
    if (selected.length >= API_MAX_IMAGES || totalBytes >= API_IMAGE_PAYLOAD_BUDGET) break;
    addFrame(s);
  }

  console.log(`Planner: sending ${selected.length}/${frames.length} frames (~${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
  return selected;
}

async function planHighlightTape(
  apiKey: string,
  scores: ScoredFrame[],
  allFrames: MultiFrameInput[],
  sourceFiles: Map<string, { name: string; type: "video" | "photo"; frameCount: number }>,
  templateName?: string
): Promise<{ clips: DetectedClip[]; detectedTheme: DetectedTheme; contentSummary: string }> {
  // Compute approximate duration for each source from max timestamp + sample interval
  const sourceDurations = new Map<string, number>();
  for (const f of allFrames) {
    const current = sourceDurations.get(f.sourceFileId) ?? 0;
    if (f.timestamp > current) sourceDurations.set(f.sourceFileId, f.timestamp);
  }

  const sourceList = Array.from(sourceFiles.entries())
    .map(([id, info]) => {
      const approxDuration = (sourceDurations.get(id) ?? 0) + 2; // +2s for last sample interval
      const durationStr = info.type === "photo" ? "photo (still)" : `~${approxDuration.toFixed(0)}s duration`;
      return `- "${info.name}" (${info.type}, ID: ${id}, ${info.frameCount} frames sampled, ${durationStr})`;
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
  for (const f of allFrames) {
    const key = `${f.sourceFileId}::${f.timestamp.toFixed(1)}`;
    if (f.audioEnergy != null) audioLookup.set(key, f.audioEnergy);
    if (f.audioOnset != null) onsetLookup.set(key, f.audioOnset);
  }

  const allScoresSummary = Array.from(scoresBySource.entries())
    .map(([fileId, fileScores]) => {
      const info = sourceFiles.get(fileId);
      const header = `── ${info?.name ?? fileId} (${info?.type ?? "video"}) ──`;
      const sorted = [...fileScores].sort((a, b) => a.timestamp - b.timestamp); // temporal order
      const lines = sorted.map(
        (s) => {
          const roleTag = s.narrativeRole ? ` [${s.narrativeRole}]` : "";
          const key = `${s.sourceFileId}::${s.timestamp.toFixed(1)}`;
          const audioVal = audioLookup.get(key);
          const onsetVal = onsetLookup.get(key);
          const audioTag = audioVal != null ? `  audio:${audioVal.toFixed(2)}` : "";
          const onsetTag = onsetVal != null && onsetVal > 0.1 ? `  onset:${onsetVal.toFixed(2)}` : "";
          return `  t:${s.timestamp.toFixed(1)}s  score:${s.score.toFixed(2)}${audioTag}${onsetTag}${roleTag}  "${s.label}"`;
        }
      );

      // Build ASCII audio visualizations for this source
      const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
      const audioVals = sorted.map((s) => audioLookup.get(`${s.sourceFileId}::${s.timestamp.toFixed(1)}`)).filter((v): v is number => v != null);
      const onsetVals = sorted.map((s) => onsetLookup.get(`${s.sourceFileId}::${s.timestamp.toFixed(1)}`)).filter((v): v is number => v != null);
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
You have ZERO constraints on your creative decisions. No limits on clip count, clip duration,
total reel length, or how you structure the tape. YOU are the editor. Make something incredible.

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

STEP 2: CHOOSE THE EDITING THEME
Your theme choice controls the entire visual style of the reel — transitions, effects, and pacing.
Pick the one that will make THIS specific content look its absolute best on Instagram:

- "sports" → flash/zoom-punch/whip/glitch transitions, entry punch zooms — NFL highlight energy
- "cooking" → crossfade/light-leak/soft-zoom dissolves — warm Bon Appétit / Tasty aesthetic
- "travel" → cinematic dissolves, light leaks, dip-to-black — Sam Kolder drone-shot vibes
- "gaming" → glitch/color-flash/strobe/zoom-punch — esports montage energy
- "party" → color-flash/strobe/flash/glitch — nightlife/festival beat-sync energy
- "fitness" → zoom-punch/flash/hard-flash/whip — motivational power edit
- "pets" → crossfades, soft-zoom/light-leak — cute animal compilation warmth
- "vlog" → hard-cuts, dip-to-black — clean modern YouTube style
- "wedding" → crossfade/light-leak/soft-zoom/dip-to-black dissolves — romantic film elegance
- "cinematic" → crossfade/dip-to-black/light-leak dissolves — professional default

Think about: What theme makes this content MOST shareable on Instagram? Match the style to the CONTENT.

STEP 2.5: READ THE AUDIO — TWO SIGNALS
Each frame has audioEnergy (volume 0-1) and audioOnset (energy CHANGE 0-1).
Each source has ASCII visualizations of both. This is how pro editors sync cuts to sound.

AUDIO ENERGY = volume at this moment:
- High (0.7+) = loud (cheering, music peak, action). Low (0-0.3) = quiet (silence, calm).

AUDIO ONSET = the beat detector. How much energy CHANGED from the previous frame:
- High onset (0.5+) = TRANSIENT. Something just happened: beat hit, clap, impact, bass drop, voice starting.
- The onset visualization shows you exactly where the rhythm of the footage lives.
- Peaks in the onset graph = natural cut points. This is where transitions should land.

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
- How long each clip is (as short or as long as the moment deserves)
- How long the total reel is (as long as it needs to be to tell the story)
- How long photos display (whatever serves the edit best)
- The clip ordering, pacing, and rhythm — all of it is your call
- Avoid consecutive clips from the same source file when possible — variety keeps attention
- NEVER repeat the same clip. Each (sourceFileId, startTime, endTime) must be UNIQUE.
  If a moment deserves emphasis, make the clip longer or use a different section — don't duplicate it.
${templateName ? `- Style context: ${templateName} template` : ""}

STEP 4: FULL VISUAL STYLE — You are the editor, not a template.
For each clip, you make EVERY visual decision. Think about what makes NFL player pages and
top influencer reels look so polished — it's because every single cut, color grade, and
effect is chosen intentionally for THAT specific moment.

VELOCITY PRESETS — speed ramping is what separates "nice edit" from "HOW did they do that":

KEY INSIGHT: Your startTime and endTime control WHERE the peak moment falls within the speed curve.
The velocity preset defines WHEN slow-mo happens. Your clip boundaries decide WHAT gets the slow-mo.

- "hero": slow-mo lives at 35-55% through the clip. Fast approach → DRAMATIC SLOW-MO → fast out.
  → Place startTime so the peak moment falls in the middle third of the clip.
  → If the big moment is at t=12s in source, try startTime=9, endTime=16 (peak at ~43%).
  → The fast lead-in BUILDS TENSION, the slow-mo lets the audience FEEL the moment, the fast exit maintains energy.

- "bullet": snap to extreme slow-mo at 25%, holds until 65%. The clip IS the moment.
  → Place the peak moment early. The entire middle is slow-mo — every frame matters.
  → Best for: peak action (the dunk, the flip, the catch), moments where detail is the payoff.

- "ramp_out": decelerates to 0.3x at the end. The moment IS the destination.
  → The peak should be at the END of the clip. We slow down INTO it.
  → Best for: landings, reveals, punchlines, "and then..." moments. The payoff lives at the end.

- "ramp_in": accelerates from 0.5x to 3x. Building toward something.
  → The peak is AFTER this clip (the next clip delivers). This clip is the build-up.
  → Best for: approach shots, tension building, "watch what happens next" energy.

- "montage": pulses 3 times between fast and slow. Multiple beats within one clip.
  → Use for rhythmic sequences where several micro-moments deserve emphasis.
  → Best for: dancing, cooking sequences, multi-action sports, rapid-fire montage sections.

- "normal": constant 1x. Use deliberately as BREATHING ROOM between ramped clips.
  → Pro editors ramp almost everything. "Normal" = a conscious choice to let the audience rest.
  → Best for: dialogue, establishing context, emotional pauses, calm before the storm.

VELOCITY ARC OF THE TAPE — the speed ramp pattern should feel like a song:
Intro (ramp_in/normal) → Build (montage/ramp_in) → DROP (hero/bullet) →
Recovery (normal) → Second build (montage) → Finale (hero/bullet) → Outro (ramp_out into loop)

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

COLOR GRADING — color is EMOTION made visible. Shift grades to create a mood journey:
"TealOrange" → cinematic drama, sports intensity, blockbuster energy
"GoldenHour" → warmth, beauty, nostalgia, "magic hour" dreaminess
"MoodyCinematic" → dark, moody, tension, dramatic weight, nighttime
"Vibrant" → joy, energy, celebration, maximum saturation pop
"Warm" → intimacy, coziness, connection, soft emotional moments
"Cool" → clean, modern, calm, distance, sophistication
"CleanAiry" → bright, fresh, daytime, youthful, optimistic
"VintageFilm" → memory, nostalgia, throwback, "remember when" feeling
"Noir" → dramatic B&W, isolation, artistic statement (use sparingly)
"Fade" → muted editorial, understated, reflective calm
"None" → the content's natural color is the right choice

COLOR SHIFT PATTERNS that create emotional journeys:
- Warm opener → TealOrange action → Warm close = "cozy → intense → cozy" (satisfaction loop)
- MoodyCinematic build → Vibrant drop = tension → release (the color change IS the payoff)
- VintageFilm flashback → CleanAiry present = nostalgia → now (time contrast)
- Cool establishing → GoldenHour hero = detached → intimate (emotional deepening)
Don't use one grade for everything. 2-3 intentional shifts across the tape = professional.

ENTRY PUNCH — the zoom "pop" when each clip appears (1.0 = none, 1.01-1.05 = subtle to dramatic):
Action clips → 1.03-1.05 (impactful pop). Emotional clips → 1.0-1.01 (gentle or none).

CAPTIONS — text that AMPLIFIES, never NARRATES. Leave empty unless it makes the moment HIT harder:
2-5 words max. The text should add a layer the visual alone can't provide.
- Emotional amplifier: "no way." / "that feeling." / "every. single. time."
- Context that transforms meaning: "day 1 vs day 365" / "she had no idea" / "watch this"
- Reaction trigger: "wait for it" / "the precision." / "obsessed"
captionStyle should MATCH the moment:
"Bold" → impact moments, exclamations, big energy (pop entrance animation)
"Minimal" → understated, elegant, "the visual does the talking" (slide-up entrance)
"Neon" → party, gaming, nightlife, stylistic accent (flicker-on animation)
"Classic" → sentimental, timeless, wedding/travel (typewriter reveal)
Use captions on 30-50% of clips max. Over-captioning = amateur. Strategic captions = editorial.

KEN BURNS — for PHOTO clips only, set zoom intensity (0.0-0.08):
0.02 = subtle drift. 0.05 = noticeable. 0.08 = dramatic. Match energy to the edit's pacing.

For each clip, provide ALL of these fields:
sourceFileId, startTime, endTime, label, confidenceScore, velocityPreset,
transitionType (skip for first clip), transitionDuration, filter,
captionText (optional), captionStyle (optional), entryPunchScale, kenBurnsIntensity (photos only)

Respond with ONLY a JSON object:
{"contentSummary": "vivid description", "theme": "one_of_the_themes", "clips": [{"sourceFileId": "...", "startTime": 0, "endTime": 8, "label": "brief description", "confidenceScore": 0.9, "velocityPreset": "hero", "transitionType": "zoom_punch", "transitionDuration": 0.3, "filter": "TealOrange", "entryPunchScale": 1.04, "captionText": "", "captionStyle": "Bold", "kenBurnsIntensity": 0}]}`;

  // Build a multimodal message: show the planner the actual frames
  const userContent: Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }> = [];

  // Build a score lookup so we can annotate each frame with its score + label
  const scoreLookup = new Map<string, ScoredFrame>();
  for (const s of scores) {
    scoreLookup.set(`${s.sourceFileId}::${s.timestamp.toFixed(1)}`, s);
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

    const scoreData = scoreLookup.get(`${frame.sourceFileId}::${frame.timestamp.toFixed(1)}`);
    const approxDuration = (sourceDurations.get(frame.sourceFileId) ?? 0) + 2;
    const position = approxDuration > 0
      ? `${((frame.timestamp / approxDuration) * 100).toFixed(0)}% through`
      : "start";

    const audioVal = frame.audioEnergy != null ? ` | AUDIO: ${frame.audioEnergy.toFixed(2)}` : "";
    const onsetVal = frame.audioOnset != null && frame.audioOnset > 0.1 ? ` | ONSET: ${frame.audioOnset.toFixed(2)}` : "";
    let annotation = `↑ "${frame.sourceFileName}" (${frame.sourceType}), fileID: ${frame.sourceFileId}, t=${frame.timestamp.toFixed(1)}s (${position})${audioVal}${onsetVal}`;
    if (scoreData) {
      const roleTag = scoreData.narrativeRole ? ` [${scoreData.narrativeRole}]` : "";
      annotation += ` | SCORE: ${scoreData.score.toFixed(2)}${roleTag} | "${scoreData.label}"`;
    }
    userContent.push({ type: "text", text: annotation });
  }

  userContent.push({
    type: "text",
    text: `\nYou've now seen ALL the footage. Think deeply:\n- What's the story across these ${sourceCount} sources?\n- What are the cross-source connections? (cause→effect, before→after, matching energy)\n- What's the emotional arc?\n- What would make this reel go VIRAL on Instagram — maximum watch-through, saves, shares, and replays?\n\nNow create the highlight tape.`,
  });

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
          model: "claude-sonnet-4-6",
          max_tokens: 16000,
          thinking: {
            type: "enabled",
            budget_tokens: 10000,
          },
          output_config: {
            effort: "high",
          },
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        }),
      },
      "Planner",
      180_000 // 3-minute timeout — Sonnet + extended thinking + 40 images
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Planner API error (HTTP ${response.status}): ${errorBody.slice(0, 200)}`);
    }

    const data = await response.json();

    // With extended thinking, response has thinking blocks + text blocks.
    // Safely extract the text block with a type guard.
    let text: string | null = null;
    if (Array.isArray(data.content)) {
      const textBlock = data.content.find((b: { type: string; text?: string }) => b.type === "text");
      text = textBlock?.text ?? null;
    }

    if (!text) {
      const preview = JSON.stringify(data).slice(0, 300);
      throw new Error(`Planner: no text block in response: ${preview}`);
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
            kenBurnsIntensity?: number;
          }>;
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
          return true;
        }).map((p, i) => {
          if (p.velocityPreset && !VALID_VELOCITIES.includes(p.velocityPreset)) {
            console.warn(`Planner: clip ${i} unrecognized velocity "${p.velocityPreset}", defaulting to "normal"`);
          }
          if (p.filter && !VALID_FILTERS.includes(p.filter)) {
            console.warn(`Planner: clip ${i} unrecognized filter "${p.filter}", dropping`);
          }
          return {
          id: crypto.randomUUID(),
          sourceFileId: p.sourceFileId,
          startTime: Math.max(0, p.startTime),
          endTime: p.endTime,
          confidenceScore: Math.max(0, Math.min(1, p.confidenceScore)),
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
          kenBurnsIntensity: (typeof p.kenBurnsIntensity === "number" && p.kenBurnsIntensity >= 0 && p.kenBurnsIntensity <= 0.15)
            ? p.kenBurnsIntensity : undefined,
        }; });

        // Deduplicate: drop clips with overlapping time ranges from the same source
        const uniqueClips: typeof clips = [];
        const seen = new Set<string>();
        for (const clip of clips) {
          const key = `${clip.sourceFileId}::${clip.startTime}::${clip.endTime}`;
          if (seen.has(key)) {
            console.warn(`Planner: dropping duplicate clip ${key}`);
            continue;
          }
          seen.add(key);
          uniqueClips.push(clip);
        }

        return { clips: uniqueClips, detectedTheme: theme, contentSummary };
    }

    throw new Error("Planner response could not be parsed as JSON");
  } catch (err) {
    // Re-throw so the retry loop in detectMultiClipHighlights can handle it
    throw err instanceof Error ? err : new Error(String(err));
  }
}

