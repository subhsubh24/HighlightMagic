"use server";

import {
  MAX_FRAMES_PER_BATCH,
  MAX_CLIP_DURATION,
  PHOTO_DISPLAY_DURATION,
} from "@/lib/constants";

// ── API helpers ──

/** Max concurrent API calls to avoid rate limits */
const MAX_CONCURRENCY = 2;

/** Retry config for 429/529 responses */
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2000;

/**
 * Fetch with retry + exponential backoff for rate limits (429) and overload (529).
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, init);
    if (response.ok) return response;

    // Only retry on rate-limit (429) or overloaded (529)
    if (response.status === 429 || response.status === 529) {
      // Use Retry-After header if available, else exponential backoff
      const retryAfter = response.headers.get("retry-after");
      const waitMs = retryAfter
        ? parseFloat(retryAfter) * 1000
        : INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      console.warn(`${label}: ${response.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(waitMs)}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    // Non-retryable error — return as-is
    return response;
  }
  // All retries exhausted — make one final attempt and return whatever we get
  return fetch(url, init);
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
    return { clips: simulateMultiDetection(frames), detectedTheme: "cinematic", contentSummary: "" };
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
  const planResult = await planHighlightTape(apiKey, allScores, frames, sourceFiles, templateName);

  // Fall back to clustering if the planning call fails
  if (planResult.clips.length === 0) {
    return { clips: clusterMultiIntoClips(allScores), detectedTheme: planResult.detectedTheme, contentSummary: planResult.contentSummary };
  }

  return planResult;
}

/**
 * Score frames across multiple source files.
 */
async function analyzeMultiBatch(
  apiKey: string,
  batch: MultiFrameInput[],
  sourceFiles: Map<string, { name: string; type: "video" | "photo"; frameCount: number }>,
  templateName?: string
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
          max_tokens: 16000,
          thinking: {
            type: "enabled",
            budget_tokens: 10000,
          },
          system: systemPrompt,
          messages: [{ role: "user", content }],
        }),
      },
      "Scoring batch"
    );

    if (!response.ok) {
      console.error("Claude API error (scoring):", response.status);
      return batch.map((f) => ({
        sourceFileId: f.sourceFileId,
        sourceType: f.sourceType,
        timestamp: f.timestamp,
        score: Math.random() * 0.5 + 0.3,
        label: "frame",
      }));
    }

    const data = await response.json();
    // With extended thinking, response has thinking blocks + text blocks
    const textBlock = (data.content as Array<{ type: string; text?: string }>)?.find(
      (b) => b.type === "text"
    );
    const text = textBlock?.text ?? data.content?.[0]?.text ?? "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      return batch.map((f) => ({
        sourceFileId: f.sourceFileId,
        sourceType: f.sourceType,
        timestamp: f.timestamp,
        score: 0.5,
        label: "frame",
      }));
    }

    const VALID_ROLES = ["HOOK", "HERO", "REACTION", "RHYTHM", "CLOSER"];
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      index: number;
      score: number;
      label: string;
      role?: string;
    }>;

    return parsed.map((p) => {
      const frame = batch[p.index];
      return {
        sourceFileId: frame?.sourceFileId ?? batch[0].sourceFileId,
        sourceType: frame?.sourceType ?? "video",
        timestamp: frame?.timestamp ?? 0,
        score: Math.max(0, Math.min(1, p.score)),
        label: p.label || "highlight",
        narrativeRole: (p.role && VALID_ROLES.includes(p.role)) ? p.role : undefined,
      };
    });
  } catch (err) {
    console.error("Detection error:", err);
    return batch.map((f) => ({
      sourceFileId: f.sourceFileId,
      sourceType: f.sourceType,
      timestamp: f.timestamp,
      score: Math.random() * 0.5 + 0.3,
      label: "frame",
    }));
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
 * Select frames for the planner to see — no artificial cap.
 * Every source file gets ALL its scored frames shown so the AI can deeply
 * understand the full footage. Sorted by score within each source,
 * with all sources represented first, then remaining frames by score.
 */
function selectPlannerFrames(
  scores: MultiFrameScore[],
  frames: MultiFrameInput[],
): MultiFrameInput[] {
  // Build a lookup from (sourceFileId, timestamp) → frame
  const frameLookup = new Map<string, MultiFrameInput>();
  for (const f of frames) {
    frameLookup.set(`${f.sourceFileId}::${f.timestamp.toFixed(1)}`, f);
  }

  // Group scores by source
  const bySource = new Map<string, MultiFrameScore[]>();
  for (const s of scores) {
    if (!bySource.has(s.sourceFileId)) bySource.set(s.sourceFileId, []);
    bySource.get(s.sourceFileId)!.push(s);
  }

  const selected: MultiFrameInput[] = [];
  const usedKeys = new Set<string>();

  // ALL frames from every source, sorted best-first within each source
  for (const [, fileScores] of bySource) {
    const sorted = [...fileScores].sort((a, b) => b.score - a.score);
    for (const score of sorted) {
      const key = `${score.sourceFileId}::${score.timestamp.toFixed(1)}`;
      const frame = frameLookup.get(key);
      if (frame && !usedKeys.has(key)) {
        selected.push(frame);
        usedKeys.add(key);
      }
    }
  }

  // Add any remaining frames not yet included
  const remaining = [...scores]
    .sort((a, b) => b.score - a.score)
    .filter((s) => !usedKeys.has(`${s.sourceFileId}::${s.timestamp.toFixed(1)}`));

  for (const s of remaining) {
    const key = `${s.sourceFileId}::${s.timestamp.toFixed(1)}`;
    const frame = frameLookup.get(key);
    if (frame) {
      selected.push(frame);
      usedKeys.add(key);
    }
  }

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
          max_tokens: 64000,
          thinking: {
            type: "enabled",
            budget_tokens: 50000,
          },
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        }),
      },
      "Planner"
    );

    if (!response.ok) {
      console.error("Planning API error:", response.status);
      return { clips: [], detectedTheme: "cinematic", contentSummary: "" };
    }

    const data = await response.json();
    // With extended thinking, response has thinking blocks + text blocks.
    // Find the actual text block (skip thinking blocks).
    const textBlock = (data.content as Array<{ type: string; text?: string }>)?.find(
      (b) => b.type === "text"
    );
    const text = textBlock?.text ?? data.content?.[0]?.text ?? "{}";

    // Try to parse as the new object format: {"contentSummary": "...", "theme": "...", "clips": [...]}
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
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

        const contentSummary = parsed.contentSummary ?? "";

        const theme: DetectedTheme =
          parsed.theme && VALID_THEMES.includes(parsed.theme as DetectedTheme)
            ? (parsed.theme as DetectedTheme)
            : "cinematic";

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

        const clips = (parsed.clips ?? []).map((p, i) => ({
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
        }));

        return { clips, detectedTheme: theme, contentSummary };
      } catch {
        // Fall through to legacy array parse
      }
    }

    // Legacy fallback: parse as plain array
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (!arrMatch) return { clips: [], detectedTheme: "cinematic", contentSummary: "" };

    const parsed = JSON.parse(arrMatch[0]) as Array<{
      sourceFileId: string;
      startTime: number;
      endTime: number;
      label: string;
      confidenceScore: number;
      velocityPreset?: string;
    }>;

    return {
      clips: parsed.map((p, i) => ({
        id: crypto.randomUUID(),
        sourceFileId: p.sourceFileId,
        startTime: Math.max(0, p.startTime),
        endTime: p.endTime,
        confidenceScore: Math.max(0, Math.min(1, p.confidenceScore)),
        label: p.label || "Highlight",
        velocityPreset: p.velocityPreset || "normal",
        order: i,
      })),
      detectedTheme: "cinematic",
      contentSummary: "",
    };
  } catch (err) {
    console.error("Planning error:", err);
    return { clips: [], detectedTheme: "cinematic", contentSummary: "" };
  }
}

/**
 * Fallback clustering for multi-source clips.
 * Always includes every source file — no clip count cap.
 */
function clusterMultiIntoClips(scores: MultiFrameScore[]): DetectedClip[] {
  const bySource = new Map<string, MultiFrameScore[]>();
  for (const s of scores) {
    if (!bySource.has(s.sourceFileId)) bySource.set(s.sourceFileId, []);
    bySource.get(s.sourceFileId)!.push(s);
  }

  const clips: DetectedClip[] = [];
  let order = 0;

  for (const [sourceFileId, fileScores] of bySource) {
    const sorted = [...fileScores].sort((a, b) => b.score - a.score);
    const best = sorted[0];
    if (!best) continue;

    if (best.sourceType === "photo") {
      clips.push({
        id: crypto.randomUUID(),
        sourceFileId,
        startTime: 0,
        endTime: PHOTO_DISPLAY_DURATION,
        confidenceScore: best.score,
        label: best.label,
        velocityPreset: "normal",
        order: order++,
      });
    } else {
      // Cluster nearby high-scoring frames around the best moment
      const nearby = fileScores.filter(
        (f) => Math.abs(f.timestamp - best.timestamp) <= MAX_CLIP_DURATION / 2
      );

      const timestamps = nearby.map((f) => f.timestamp);
      const minT = Math.min(...timestamps);
      const maxT = Math.max(...timestamps);
      const center = (minT + maxT) / 2;
      // Shorter clip (2s min) for weaker sources, longer for strong ones
      const minHalf = best.score >= 0.65 ? 2.5 : 1;
      const halfDur = Math.max(minHalf, (maxT - minT) / 2);

      clips.push({
        id: crypto.randomUUID(),
        sourceFileId,
        startTime: Math.round(Math.max(0, center - halfDur) * 10) / 10,
        endTime: Math.round(Math.min(center + halfDur, center + MAX_CLIP_DURATION / 2) * 10) / 10,
        confidenceScore: Math.round((nearby.reduce((s, f) => s + f.score, 0) / nearby.length) * 100) / 100,
        label: best.label,
        velocityPreset: "normal",
        order: order++,
      });
    }
  }

  // Sort by confidence descending then re-number with hook-first ordering
  clips.sort((a, b) => b.confidenceScore - a.confidenceScore);
  clips.forEach((c, i) => { c.order = i; });
  return clips;
}

/**
 * Simulated multi-clip detection when no API key is configured.
 * Always includes every source file.
 */
function simulateMultiDetection(frames: MultiFrameInput[]): DetectedClip[] {
  const sourceIds = [...new Set(frames.map((f) => f.sourceFileId))];
  const clips: DetectedClip[] = [];

  sourceIds.forEach((sourceId, i) => {
    const sourceFrames = frames.filter((f) => f.sourceFileId === sourceId);
    const isPhoto = sourceFrames[0]?.sourceType === "photo";

    if (isPhoto) {
      clips.push({
        id: crypto.randomUUID(),
        sourceFileId: sourceId,
        startTime: 0,
        endTime: PHOTO_DISPLAY_DURATION,
        confidenceScore: Math.round((0.9 - i * 0.04) * 100) / 100,
        label: "Photo moment",
        velocityPreset: "normal",
        order: i,
      });
    } else {
      const maxTime = sourceFrames[sourceFrames.length - 1]?.timestamp ?? 30;
      const center = maxTime / 2;
      const halfDur = 1 + Math.random() * 5;
      clips.push({
        id: crypto.randomUUID(),
        sourceFileId: sourceId,
        startTime: Math.max(0, center - halfDur),
        endTime: Math.min(maxTime, center + halfDur),
        confidenceScore: Math.round((0.95 - i * 0.05) * 100) / 100,
        label: "Highlight moment",
        velocityPreset: "normal",
        order: i,
      });
    }
  });

  return clips;
}
