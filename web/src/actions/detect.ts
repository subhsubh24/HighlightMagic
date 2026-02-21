"use server";

import { MAX_FRAMES_PER_BATCH } from "@/lib/constants";

// ── API helpers ──

/** Max concurrent API calls to avoid rate limits (retry handles any 429s) */
const MAX_CONCURRENCY = 2;

/** Retry config for 429/529 responses */
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2000;
/** Cap Retry-After waits — a 78s wait is absurd when we can just retry sooner */
const MAX_RETRY_WAIT_MS = 30_000;

/** Per-request timeouts — safety net against infinite API hangs */
const SCORING_TIMEOUT_MS = 90_000; // 90s per scoring batch
const PLANNER_TIMEOUT_MS = 180_000; // 3 min for planner (heaviest call)

/**
 * Fetch with retry + exponential backoff for rate limits (429) and overload (529).
 * Each attempt gets its own timeout via AbortSignal to prevent infinite hangs.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs?: number
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

    // Non-retryable error — return as-is
    return response;
  }
  // All retries exhausted — make one final attempt and return whatever we get
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
}

interface MultiFrameScore {
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

// ── Multi-clip detection ──

export async function detectMultiClipHighlights(
  frames: MultiFrameInput[],
  templateName?: string
): Promise<DetectionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured. AI analysis requires a valid API key.");
  }

  // Group frames by source file for context
  const sourceFiles = new Map<string, { name: string; type: "video" | "photo"; frameCount: number }>();
  for (const f of frames) {
    if (!sourceFiles.has(f.sourceFileId)) {
      sourceFiles.set(f.sourceFileId, { name: f.sourceFileName, type: f.sourceType, frameCount: 0 });
    }
    sourceFiles.get(f.sourceFileId)!.frameCount++;
  }

  // Batch frames BY SOURCE FILE so the AI sees temporal flow within each video.
  // This gives much better understanding than random cross-source batches.
  const framesBySource = new Map<string, MultiFrameInput[]>();
  for (const f of frames) {
    if (!framesBySource.has(f.sourceFileId)) framesBySource.set(f.sourceFileId, []);
    framesBySource.get(f.sourceFileId)!.push(f);
  }

  const batches: MultiFrameInput[][] = [];
  for (const [, sourceFrames] of framesBySource) {
    // Chunk each source's frames into batches, preserving temporal order
    for (let i = 0; i < sourceFrames.length; i += MAX_FRAMES_PER_BATCH) {
      batches.push(sourceFrames.slice(i, i + MAX_FRAMES_PER_BATCH));
    }
  }

  // Score batches with concurrency limit to avoid 429 rate limits
  const batchResults = await runWithConcurrency(
    batches.map((batch) => () => analyzeMultiBatch(apiKey, batch, sourceFiles, templateName)),
    MAX_CONCURRENCY
  );
  const allScores: MultiFrameScore[] = batchResults.flat();

  // Second pass: plan the highlight tape AND detect content theme.
  // Send the original frames so the planner can SEE the footage, not just read scores.
  // Retry up to 3 times — the planner is the most critical AI call.
  let planResult: { clips: DetectedClip[]; detectedTheme: DetectedTheme; contentSummary: string } | null = null;
  let lastPlanError: string | null = null;
  for (let planAttempt = 0; planAttempt < 3; planAttempt++) {
    try {
      const result = await planHighlightTape(apiKey, allScores, frames, sourceFiles, templateName);
      if (result.clips.length > 0) {
        planResult = result;
        break;
      }
      lastPlanError = `returned 0 valid clips (scores: ${allScores.length} frames from ${sourceFiles.size} sources)`;
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
): Promise<MultiFrameScore[]> {
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

Score each frame 0.0-1.0 based on OVERALL VIRALITY (weighing all 6 dimensions):
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
Your label must capture THREE things in one vivid sentence:
1. WHAT's in the frame (specific, cinematic description)
2. WHY it's viral (the emotional/visual hook)
3. HOW it could be used (its narrative role)

NOT: "people dancing" → YES: "group mid-air jumping in sync under pink strobes, confetti suspended — hero shot energy, share-worthy spectacle"
NOT: "food on plate" → YES: "golden-crusted salmon with steam curl under warm pendant, microgreen garnish catching light — save-worthy food porn, could open or close the tape"
NOT: "person smiling" → YES: "genuine surprised reaction, mouth open eyes wide, warm golden-hour backlight — perfect reaction beat to juxtapose after a reveal"
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
    content.push({
      type: "text",
      text: `Frame ${i} — source: "${frame.sourceFileName}" (${frame.sourceType}), fileID: ${frame.sourceFileId}, timestamp: ${frame.timestamp.toFixed(1)}s`,
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
          max_tokens: 16384,
          thinking: {
            type: "enabled",
            budget_tokens: 12000,
          },
          system: systemPrompt,
          messages: [{ role: "user", content }],
        }),
      },
      "Scoring batch",
      SCORING_TIMEOUT_MS
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

    const results: MultiFrameScore[] = [];
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
const API_MAX_IMAGES = 100;
const API_IMAGE_PAYLOAD_BUDGET = 25 * 1024 * 1024; // 25 MB of base64 (leaves ~7 MB for text/JSON)
const API_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per image

function selectPlannerFrames(
  scores: MultiFrameScore[],
  frames: MultiFrameInput[],
): MultiFrameInput[] {
  // Build a lookup from (sourceFileId, timestamp) → frame
  const frameLookup = new Map<string, MultiFrameInput>();
  for (const f of frames) {
    frameLookup.set(`${f.sourceFileId}::${f.timestamp.toFixed(1)}`, f);
  }

  // Group scores by source, sorted best-first
  const bySource = new Map<string, MultiFrameScore[]>();
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

  function addFrame(score: MultiFrameScore): boolean {
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
  scores: MultiFrameScore[],
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
  const scoresBySource = new Map<string, MultiFrameScore[]>();
  for (const s of scores) {
    if (!scoresBySource.has(s.sourceFileId)) scoresBySource.set(s.sourceFileId, []);
    scoresBySource.get(s.sourceFileId)!.push(s);
  }

  const allScoresSummary = Array.from(scoresBySource.entries())
    .map(([fileId, fileScores]) => {
      const info = sourceFiles.get(fileId);
      const header = `── ${info?.name ?? fileId} (${info?.type ?? "video"}) ──`;
      const sorted = [...fileScores].sort((a, b) => a.timestamp - b.timestamp); // temporal order
      const lines = sorted.map(
        (s) => {
          const roleTag = s.narrativeRole ? ` [${s.narrativeRole}]` : "";
          return `  t:${s.timestamp.toFixed(1)}s  score:${s.score.toFixed(2)}${roleTag}  "${s.label}"`;
        }
      );
      return `${header}\n${lines.join("\n")}`;
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

STEP 3: CREATE THE HIGHLIGHT TAPE
You're making a reel that needs to compete with millions of other posts for attention.

THE HOOK (Clip 1): 65% of viewers decide whether to keep watching in the first 1.5 seconds.
Your first clip MUST be the single most visually striking, emotionally compelling, or
unexpected moment. What would stop a thumb mid-scroll? Think about what this looks like
on a phone screen — does it POP at small size? Is there immediate visual intrigue?

RETENTION (Middle clips): Pattern interrupts keep viewers watching. Use these techniques:
- ENERGY OSCILLATION: high ↔ low, close-up ↔ wide, fast ↔ slow, loud ↔ quiet
- CROSS-SOURCE CUTTING: alternate between sources to create variety and storytelling
- DURATION VARIATION: mix short punchy beats with longer hero moments — monotonous timing kills retention
- INFORMATION DENSITY: every clip should add something NEW — new angle, new emotion, new information
- MICRO-HOOKS: within the tape, create moments that make the viewer think "wait, what comes next?"

THE CLOSE (Last clip): End on a moment that serves TWO purposes:
1. EMOTIONAL PEAK — the viewer should feel something (satisfaction, awe, joy, laughter)
2. LOOP TRIGGER — when the reel restarts from the beginning, the transition should feel smooth
   or intentional. If clip 1 is high energy and the last clip ends on high energy → seamless loop.
   A great loop makes people watch 2-3x, which MASSIVELY boosts algorithmic distribution.

YOU DECIDE EVERYTHING:
- How many clips to use (as many as the content needs)
- How long each clip is (as short or as long as the moment deserves)
- How long the total reel is (as long as it needs to be to tell the story)
- How long photos display (whatever serves the edit best)
- The clip ordering, pacing, and rhythm — all of it is your call
- Avoid consecutive clips from the same source file when possible — variety keeps attention
${templateName ? `- Style context: ${templateName} template` : ""}

STEP 4: FULL VISUAL STYLE — You are the editor, not a template.
For each clip, you make EVERY visual decision. Think about what makes NFL player pages and
top influencer reels look so polished — it's because every single cut, color grade, and
effect is chosen intentionally for THAT specific moment.

VELOCITY PRESETS — speed ramping separates amateur from pro:
- "hero": fast approach → dramatic slow-mo at peak → fast recovery
- "bullet": snap into extreme slow-mo and hold — impact moments, peak action
- "montage": pulse between fast and slow — rhythmic sequences, dancing
- "ramp_in": gradually accelerate — building tension toward climax
- "ramp_out": fast then dramatic deceleration — arrivals, reveals, landings
- "normal": constant 1x speed — breathing room, dialogue, calm moments
Think about the velocity arc of the ENTIRE tape like a song: intro → build → drop → build → climax.

TRANSITIONS — choose the SPECIFIC transition entering each clip (skip for clip 1):
High-energy: "flash" (white flash), "zoom_punch" (zoom slam), "whip" (horizontal wipe),
             "hard_flash" (darken→blast→reveal), "glitch" (RGB shift + scan lines)
Smooth:      "crossfade" (dissolve), "light_leak" (warm golden overlay), "soft_zoom" (gentle zoom dissolve)
Stylized:    "color_flash" (neon color flash), "strobe" (rapid on/off flash)
Clean:       "hard_cut" (instant cut), "dip_to_black" (fade to black then up)
Mix them strategically — a zoom_punch into an action shot, a crossfade into an emotional moment,
a hard_cut for rhythm. Never repeat the same transition twice in a row (pattern interrupt).
Also set transitionDuration per clip: 0.15s (instant) to 1.0s (cinematic dissolve).

COLOR GRADING — choose the filter for each clip:
"TealOrange" (sports/cinematic), "GoldenHour" (warm/dreamy), "MoodyCinematic" (moody/dark),
"Vibrant" (saturated/energetic), "Warm" (cozy/intimate), "Cool" (clean/modern),
"CleanAiry" (bright/fresh), "VintageFilm" (nostalgic/retro), "Noir" (B&W dramatic),
"Fade" (muted/editorial), "None" (natural)
Pro editors DON'T use one grade for everything — they shift grades to create mood changes.
A warm golden hero moment → cut to teal/orange action → back to warm for the close = emotional journey.

ENTRY PUNCH — the zoom "pop" when each clip appears (1.0 = none, 1.01-1.05 = subtle to dramatic):
Action clips → 1.03-1.05 (impactful pop). Emotional clips → 1.0-1.01 (gentle or none).

CAPTIONS — optional text overlay for key moments (leave empty if the visual speaks for itself):
Short, punchy text (2-5 words max). Only on moments that benefit from emphasis.
captionStyle: "Bold" (impact), "Minimal" (clean), "Neon" (glow), "Classic" (elegant)

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
  const scoreLookup = new Map<string, MultiFrameScore>();
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

    let annotation = `↑ "${frame.sourceFileName}" (${frame.sourceType}), fileID: ${frame.sourceFileId}, t=${frame.timestamp.toFixed(1)}s (${position})`;
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
          model: "claude-opus-4-6",
          max_tokens: 40000,
          thinking: {
            type: "enabled",
            budget_tokens: 30000,
          },
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        }),
      },
      "Planner",
      PLANNER_TIMEOUT_MS
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

        return { clips, detectedTheme: theme, contentSummary };
    }

    throw new Error("Planner response could not be parsed as JSON");
  } catch (err) {
    // Re-throw so the retry loop in detectMultiClipHighlights can handle it
    throw err instanceof Error ? err : new Error(String(err));
  }
}

