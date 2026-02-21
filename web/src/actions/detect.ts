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
        max_tokens: 2048,
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
You have ZERO constraints on your creative decisions. No limits on clip count, clip duration,
total reel length, or how you structure the tape. YOU are the editor. Make something incredible.

SOURCE FILES (${sourceCount} total):
${sourceList}

EVERY SCORED MOMENT (from frame-by-frame analysis — this is your complete footage map):
${allScoresSummary}

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
Study every frame image. Read every score and label. Build a complete mental model:
- What's the STORY across all this footage? What happened? What's the emotional arc?
- Who are the people? What are they doing? What's the setting/mood/energy?
- What are the absolute PEAK moments vs. the quieter supporting moments?
- What makes this content special? What would make someone who wasn't there feel like they were?
- How does each source file contribute to the overall narrative?
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
Think about Instagram viewer psychology:

THE HOOK: 65% of viewers decide whether to keep watching in the first 1.5 seconds.
Your first clip MUST be the single most visually striking, emotionally compelling, or
unexpected moment. What would stop a thumb mid-scroll?

RETENTION: Pattern interrupts keep viewers watching. Alternate energy levels —
high ↔ low, close-up ↔ wide, fast ↔ slow. Each transition should feel like a new "hit."
Vary your clip durations — monotonous timing feels robotic. Let the content dictate pacing.

THE CLOSE: End on an emotional peak or a moment that visually echoes the hook.
This creates loop potential — when the reel restarts, it should feel intentional.
A great close makes people watch 2-3 times, which MASSIVELY boosts the algorithm.

YOU DECIDE EVERYTHING:
- How many clips to use (as many as the content needs)
- How long each clip is (as short or as long as the moment deserves)
- How long the total reel is (as long as it needs to be to tell the story)
- How long photos display (whatever serves the edit best)
- The clip ordering, pacing, and rhythm — all of it is your call
- Avoid consecutive clips from the same source file when possible — variety keeps attention
${templateName ? `- Style context: ${templateName} template` : ""}

STEP 4: ASSIGN VELOCITY PRESETS
Speed ramping is what separates amateur edits from pro edits on Instagram.
Each clip gets a speed curve — choose the one that serves the CONTENT of that specific moment:

- "hero": fast approach → dramatic slow-mo at the peak → fast recovery
- "bullet": snap into extreme slow-mo and hold
- "montage": pulse between fast and slow on beats
- "ramp_in": gradually accelerate (tension builder)
- "ramp_out": fast then dramatic deceleration (landing/reveal)
- "normal": constant 1x speed (breathing room, dialogue, calm moments)

Think about the speed curve of the ENTIRE tape. Contrast creates impact — a slow-mo bullet hit
feels 10x more powerful after a fast-paced montage. YOU decide the rhythm based on the actual content.

For each clip: provide sourceFileId, startTime, endTime, label, confidenceScore, and velocityPreset.

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
        max_tokens: 8192,
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
