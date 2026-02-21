"use server";

import {
  MAX_FRAMES_PER_BATCH,
  MAX_CLIP_DURATION,
  PHOTO_DISPLAY_DURATION,
} from "@/lib/constants";

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

  // Batch frames for Claude Vision
  const batches: MultiFrameInput[][] = [];
  for (let i = 0; i < frames.length; i += MAX_FRAMES_PER_BATCH) {
    batches.push(frames.slice(i, i + MAX_FRAMES_PER_BATCH));
  }

  const allScores: MultiFrameScore[] = [];

  for (const batch of batches) {
    const scores = await analyzeMultiBatch(apiKey, batch, sourceFiles, templateName);
    allScores.push(...scores);
  }

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

  const systemPrompt = `You are a world-class Instagram Reels / TikTok editor. Your reels average 2M+ views
because you understand EXACTLY what makes someone stop scrolling and watch.

You're reviewing raw footage from ${sourceFiles.size} source files. Your job: deeply understand
every single frame — what's happening, the emotion, the visual quality, the storytelling potential.

SOURCE FILES:
${sourceList}

STUDY EACH FRAME CAREFULLY. For every frame, think through:
- Would this make someone stop mid-scroll on Instagram? WHY or why not?
- What's the visual energy? (composition, lighting, color, motion blur, depth)
- What's the emotional energy? (joy, surprise, tension, awe, humor, intimacy)
- How could this moment serve the highlight tape? (hero shot, reaction beat, B-roll transition, opener, closer)
- What story does this frame tell on its own? What story does it tell in sequence?

Score each frame 0.0-1.0:
- 0.85-1.0: SCROLL-STOPPING — you'd stop mid-scroll for this. Peak action, raw emotion,
  stunning composition, dramatic lighting, unexpected moments, faces showing genuine feeling,
  particles in motion, decisive moments, perfect timing.
- 0.65-0.84: STRONG — compelling, good energy, interesting composition, key narrative beats.
  Would work great as a supporting moment in the tape.
- 0.35-0.64: LOWER ENERGY — generic, flat, less visually interesting. Still usable as a
  quick beat or transition moment if this is the best from its source file.
- 0.0-0.34: UNUSABLE — black frames, extreme blur, obstructed lens, test footage.

CRITICAL: Your label must be SPECIFIC and VIVID — paint a picture in words.
Not "people dancing" but "group jumping in sync under pink strobe lights with confetti raining down."
Not "food on plate" but "golden-crusted salmon with microgreens, steam rising under warm pendant light."
The label should make someone SEE the moment. This is what the tape planner reads to understand the footage.
${templateName ? `\nStyle context: ${templateName} template` : ""}

Respond with ONLY a JSON array:
[{"index": 0, "score": 0.85, "label": "vivid cinematic description of the moment"}]`;

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
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      console.error("Claude API error:", response.status);
      return batch.map((f) => ({
        sourceFileId: f.sourceFileId,
        sourceType: f.sourceType,
        timestamp: f.timestamp,
        score: Math.random() * 0.5 + 0.3,
        label: "frame",
      }));
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "[]";
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

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ index: number; score: number; label: string }>;

    return parsed.map((p) => {
      const frame = batch[p.index];
      return {
        sourceFileId: frame?.sourceFileId ?? batch[0].sourceFileId,
        sourceType: frame?.sourceType ?? "video",
        timestamp: frame?.timestamp ?? 0,
        score: Math.max(0, Math.min(1, p.score)),
        label: p.label || "highlight",
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

const MAX_PLANNER_FRAMES = 20; // visual frames sent to the planner — more context = better decisions

/**
 * Select a diverse set of top-scoring frames for the planner to see.
 * Ensures every source file is represented, then fills remaining slots by score.
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

  // Ensure at least one frame per source file (the best-scoring one)
  const bySource = new Map<string, MultiFrameScore[]>();
  for (const s of scores) {
    if (!bySource.has(s.sourceFileId)) bySource.set(s.sourceFileId, []);
    bySource.get(s.sourceFileId)!.push(s);
  }

  const selected: MultiFrameInput[] = [];
  const usedKeys = new Set<string>();

  // Top 2 frames per source so the planner understands each file's range
  for (const [, fileScores] of bySource) {
    const topTwo = [...fileScores].sort((a, b) => b.score - a.score).slice(0, 2);
    for (const best of topTwo) {
      const key = `${best.sourceFileId}::${best.timestamp.toFixed(1)}`;
      const frame = frameLookup.get(key);
      if (frame && !usedKeys.has(key)) {
        selected.push(frame);
        usedKeys.add(key);
      }
    }
  }

  // Fill remaining slots with highest-scoring frames we haven't picked
  const remaining = [...scores]
    .sort((a, b) => b.score - a.score)
    .filter((s) => !usedKeys.has(`${s.sourceFileId}::${s.timestamp.toFixed(1)}`));

  for (const s of remaining) {
    if (selected.length >= MAX_PLANNER_FRAMES) break;
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
  const sourceList = Array.from(sourceFiles.entries())
    .map(([id, info]) => `- "${info.name}" (${info.type}, ID: ${id}, ${info.frameCount} frames sampled)`)
    .join("\n");

  // Send ALL scores to the planner — it needs the full picture to reason about every source
  const allScoresSummary = [...scores]
    .sort((a, b) => b.score - a.score)
    .map((s) => `fileID:${s.sourceFileId} type:${s.sourceType} t:${s.timestamp.toFixed(1)}s score:${s.score.toFixed(2)} "${s.label}"`)
    .join("\n");

  // Select diverse frames for the planner to actually SEE
  const plannerFrames = selectPlannerFrames(scores, allFrames);

  const sourceCount = sourceFiles.size;

  const systemPrompt = `You are a viral Instagram Reels editor. Your edits consistently hit 1M+ views because you
understand the psychology of what makes people stop scrolling, watch to the end, and smash that share button.

You are being shown the ACTUAL FRAMES from the user's footage. Study every single one deeply.

SOURCE FILES (${sourceCount} total):
${sourceList}

EVERY SCORED MOMENT (from frame-by-frame analysis — this is your complete footage map):
${allScoresSummary}

═══════════════════════════════════════════════
ABSOLUTE RULE: USE EVERY SOURCE FILE
═══════════════════════════════════════════════
The user uploaded ${sourceCount} files. They chose these files for a reason.
You MUST include at least one clip from EVERY single source file. No exceptions.
- Strong sources → longer, prominent clips that carry the tape
- Weaker sources → shorter beats (2-4s). Even a quick flash, a reaction shot, or a
  transitional cutaway is better than leaving it out entirely
- The user should NEVER open their highlight reel and think "where's my clip?"

═══════════════════════════════════════════════
YOUR PROCESS — Think like a pro editor, not a robot
═══════════════════════════════════════════════

STEP 1: DEEPLY UNDERSTAND THE CONTENT
Look at every frame image. Read every score and label. Build a mental model:
- What's the STORY across all this footage? What happened? What's the emotional arc?
- Who are the people? What are they doing? What's the setting/mood/energy?
- What are the absolute PEAK moments vs. the quieter supporting moments?
- What makes this content special? What would make someone who wasn't there feel like they were?
Put your understanding in a "contentSummary" field (2-3 vivid sentences).

STEP 2: CHOOSE THE EDITING THEME
Your theme choice controls the entire visual style of the reel — transitions, effects, and pacing.
Pick the one that will make THIS specific content look its absolute best on Instagram:

- "sports" → 0.3s cuts, flash/zoom-punch/whip/glitch transitions, entry punch zooms — NFL highlight energy
- "cooking" → 0.8s dissolves, crossfade/light-leak/soft-zoom — warm Bon Appétit / Tasty aesthetic
- "travel" → 1.0s cinematic dissolves, light leaks, dip-to-black — Sam Kolder drone-shot vibes
- "gaming" → 0.25s cuts, glitch/color-flash/strobe/zoom-punch — esports montage energy
- "party" → 0.25s cuts, color-flash/strobe/flash/glitch — nightlife/festival beat-sync energy
- "fitness" → 0.3s cuts, zoom-punch/flash/hard-flash/whip — motivational power edit
- "pets" → 0.6s crossfades, soft-zoom/light-leak — cute animal compilation warmth
- "vlog" → 0.15s hard-cuts, dip-to-black — clean modern YouTube style
- "wedding" → 0.9s dissolves, crossfade/light-leak/soft-zoom/dip-to-black — romantic film elegance
- "cinematic" → 0.7s dissolves, crossfade/dip-to-black/light-leak — professional default

Think about: What theme makes this content MOST shareable on Instagram? A beach vacation
deserves "travel" dissolves, not "gaming" glitches. A dance party needs "party" strobes, not "cooking" warmth.

STEP 3: CREATE THE HIGHLIGHT TAPE
You're making a reel that needs to compete with millions of other posts for attention.
Think about Instagram viewer psychology:

THE HOOK (first 1.5 seconds):
- 65% of viewers decide whether to keep watching in the first 1.5 seconds
- Your first clip MUST be the single most visually striking, emotionally compelling, or
  unexpected moment from ALL the footage. What would stop a thumb mid-scroll?

RETENTION (middle):
- Pattern interrupts every 3-5 seconds keep viewers watching. Alternate between:
  high energy ↔ breathing room, close-up ↔ wide shot, fast ↔ slow, loud ↔ quiet
- Each clip transition should feel like a new "hit" — a reason to keep watching
- Vary clip durations. Monotonous timing (all 5s clips) feels robotic.
  Mix short punchy beats (2-3s) with longer hero moments (6-12s).

THE CLOSE (last clip):
- End on an emotional peak or a moment that visually echoes the hook
- This creates loop potential — when the reel restarts, it should feel intentional
- A great close makes people watch 2-3 times, which MASSIVELY boosts the algorithm

DURATION STRATEGY:
- Hero moments: 5-15s — let them breathe, these are why people share the reel
- Supporting beats: 3-5s — enough to register and contribute to the story
- Quick flashes: 2-3s — B-roll, reactions, transitional energy, weaker source files
- Photos: ${PHOTO_DISPLAY_DURATION}s each — emotional pauses or transition beats
- Total reel: aim for 15-45 seconds of pure magic
- Avoid consecutive clips from the same source file — variety keeps attention
${templateName ? `- Style context: ${templateName} template` : ""}

STEP 4: ASSIGN VELOCITY PRESETS
Speed ramping is what separates amateur edits from pro edits on Instagram.
Each clip gets a speed curve — choose the one that serves the CONTENT of that specific moment:

- "hero": fast approach → dramatic slow-mo at the peak → fast recovery
  Best for: THE moment of the reel. A goal scored, a first kiss, a dance move landing, a reveal.
- "bullet": snap into extreme slow-mo and hold
  Best for: impact moments. A collision, a surprise reaction, a dramatic entrance.
- "montage": pulse between fast and slow on beats
  Best for: rhythmic sequences. Dancing, sports plays, cooking steps, travel montage.
- "ramp_in": gradually accelerate
  Best for: building tension. Approaching a climax, walking toward something, countdown moments.
- "ramp_out": fast then dramatic deceleration
  Best for: arrivals and reveals. Landing a trick, reaching a summit, unveiling a finished dish.
- "normal": constant 1x speed
  Best for: breathing room. Let an emotional moment speak for itself. Dialogue. Calm B-roll.

RHYTHM MATTERS: Think about the speed curve of the ENTIRE tape. If every clip is "hero",
nothing feels special. Create contrast — a slow-mo bullet hit feels 10x more powerful after
a fast-paced montage sequence. YOU decide the rhythm based on the actual content.

For video clips: startTime and endTime (2-${MAX_CLIP_DURATION}s each).
For photos: startTime=0, endTime=${PHOTO_DISPLAY_DURATION}.

Respond with ONLY a JSON object:
{"contentSummary": "vivid description", "theme": "one_of_the_themes", "clips": [{"sourceFileId": "...", "startTime": 0, "endTime": 8, "label": "brief description", "confidenceScore": 0.9, "velocityPreset": "hero"}]}`;

  // Build a multimodal message: show the planner the actual frames
  const userContent: Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }> = [];

  userContent.push({
    type: "text",
    text: `Here are ${plannerFrames.length} frames from ${sourceFiles.size} source files. Study every single frame — the composition, lighting, emotion, motion, story. Understand the content deeply before you make any editing decisions.\n`,
  });

  for (const frame of plannerFrames) {
    userContent.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: frame.base64 },
    });
    userContent.push({
      type: "text",
      text: `↑ Source: "${frame.sourceFileName}" (${frame.sourceType}), fileID: ${frame.sourceFileId}, timestamp: ${frame.timestamp.toFixed(1)}s`,
    });
  }

  userContent.push({
    type: "text",
    text: "\nYou've now seen all the footage. Think deeply: What's the story? What's the emotional arc? What would make this reel go viral on Instagram? Now create the highlight tape that will get maximum likes, shares, and saves.",
  });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!response.ok) {
      console.error("Planning API error:", response.status);
      return { clips: [], detectedTheme: "cinematic", contentSummary: "" };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "{}";

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
          }>;
        };

        const contentSummary = parsed.contentSummary ?? "";

        const theme: DetectedTheme =
          parsed.theme && VALID_THEMES.includes(parsed.theme as DetectedTheme)
            ? (parsed.theme as DetectedTheme)
            : "cinematic";

        const VALID_VELOCITIES = ["normal", "hero", "bullet", "ramp_in", "ramp_out", "montage"];

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
