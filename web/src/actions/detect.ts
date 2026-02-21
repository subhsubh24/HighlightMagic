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

  const systemPrompt = `You are a top-tier Instagram/TikTok editor whose reels get millions of views.
You're reviewing raw footage to find the moments that belong in a viral highlight reel.

SOURCE FILES:
${sourceList}

For each frame, score 0.0-1.0 by thinking like someone scrolling Instagram:

SCROLL-STOPPING (0.85-1.0): Would you stop mid-scroll for this? Peak action, raw emotion,
stunning composition, dramatic lighting, unexpected moments, faces showing genuine emotion,
confetti/particles in motion, first kiss, goal scored, dance floor peak.

STRONG (0.65-0.84): Compelling but not jaw-dropping. Good motion, interesting composition,
key narrative beats, establishing shots that set the scene.

FILLER (0.35-0.64): Generic, flat, poorly lit, nothing happening, blurry, backs of heads,
setting up equipment, waiting around. Every event has these — skip them.

UNUSABLE (0.0-0.34): Black frames, extreme blur, obstructed lens, test footage.

Your label should be SPECIFIC and VIVID — not "people dancing" but "group jumping in sync
under pink strobe lights" or "bride turning with veil catching golden backlight."
The label helps the planner understand what this moment FEELS like.
${templateName ? `\nStyle context: ${templateName} template` : ""}

Respond with ONLY a JSON array:
[{"index": 0, "score": 0.85, "label": "vivid description of the moment"}]`;

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

const MAX_PLANNER_FRAMES = 15; // visual frames sent to the planner

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

  // One best frame per source
  for (const [, fileScores] of bySource) {
    const best = [...fileScores].sort((a, b) => b.score - a.score)[0];
    if (!best) continue;
    const key = `${best.sourceFileId}::${best.timestamp.toFixed(1)}`;
    const frame = frameLookup.get(key);
    if (frame && !usedKeys.has(key)) {
      selected.push(frame);
      usedKeys.add(key);
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

  const topScores = [...scores]
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map((s) => `fileID:${s.sourceFileId} type:${s.sourceType} t:${s.timestamp.toFixed(1)}s score:${s.score.toFixed(2)} "${s.label}"`)
    .join("\n");

  // Select diverse frames for the planner to actually SEE
  const plannerFrames = selectPlannerFrames(scores, allFrames);

  const sourceCount = sourceFiles.size;

  const systemPrompt = `You are a world-class Instagram Reels / TikTok editor whose content gets millions of views.
You are being shown the ACTUAL FRAMES from the user's source footage. Study them carefully.

SOURCE FILES (${sourceCount} total):
${sourceList}

SCORED MOMENTS (from frame-by-frame analysis — higher score = more highlight-worthy):
${topScores}

CRITICAL RULE: The user uploaded ${sourceCount} files because they want ALL of them in the tape.
You MUST include at least one clip from EVERY source file. No exceptions.
- Star sources get longer, more prominent clips (5-15s depending on genre)
- Weaker sources still appear but as shorter beats (2-4s) — a quick flash, a reaction shot, a transitional moment
- The user should never wonder "why didn't it use my clip?"

You must do FOUR things. Use your creative judgment for all of them — YOU are the editor.

1. WATCH & UNDERSTAND — Look at every frame image. What's the story across all the footage?
   What's the vibe? Who's in it? What are the peak moments? What's filler?
   Think like a cinematographer reviewing dailies before making cuts.
   Put this in a "contentSummary" field (2-3 sentences, vivid and specific).

2. DETECT THE CONTENT THEME — based on what you SAW, pick the best editing style.
   Choose exactly one: sports, cooking, travel, gaming, party, fitness, pets, vlog, wedding, cinematic
   - sports: athletic/competition → fast cuts, flash transitions, zoom punches
   - cooking: food preparation/plating → smooth dissolves, warm tones, gentle pacing
   - travel: scenic/adventure/landmarks → cinematic dissolves, light leaks, slow zooms
   - gaming: screen recordings/esports → glitch effects, neon flashes, rapid cuts
   - party: celebrations/nightlife/events → colored strobes, beat-sync energy, rapid cuts
   - fitness: workouts/gym/exercise → impact zooms, power flashes
   - pets: animals/pets → soft crossfades, warm glows, gentle pacing
   - vlog: daily life/talking head → clean jump cuts, minimal transitions
   - wedding: ceremony/vows/reception/first dance → romantic dissolves, elegant slow reveals, warm tones
   - cinematic: general/mixed/artistic → film dissolves, subtle light leaks

3. CREATE THE HIGHLIGHT TAPE — You decide how many clips and how long each one is.
   Think about what would make someone stop scrolling, watch to the end, and hit share.
   The total reel should feel like 15-45 seconds of pure magic.

   YOUR EDITORIAL PROCESS (think through this):
   - Which moment is the most visually striking? That's your hook — put it first.
   - What moments create CONTRAST? Contrast is rhythm (action/calm, wide/close, fast/slow).
   - How do you build toward an emotional peak without blowing it too early?
   - What ending invites replay? (Ideally visually similar to the hook for loop potential)
   - How does each source file fit into the story you're telling?

   Use your judgment on clip duration:
   - Hero moments deserve 5-15s to breathe
   - Quick beats, reactions, B-roll can be 2-4s — just enough to register
   - Match the pacing to the genre and energy (party = fast cuts, wedding = let moments breathe)
   - Photos work as transition beats or emotional pauses (${PHOTO_DISPLAY_DURATION}s each)
   - Avoid consecutive clips from the same source when possible
${templateName ? `   - Style hint: ${templateName}` : ""}

4. ASSIGN VELOCITY PRESETS — Pick the speed curve that serves each moment best.
   You have full creative control. Variety creates rhythm; monotony kills it.

   Available presets:
   - "hero": fast approach → dramatic slow-mo at the peak → fast recovery
   - "bullet": snap into extreme slow-mo and hold
   - "montage": pulse between fast and slow on beats
   - "ramp_in": gradually build speed (tension builder)
   - "ramp_out": start fast then dramatic deceleration (landing/reveal)
   - "normal": constant 1x speed (breathing room, dialogue, calm moments)

   Think about the rhythm of the whole tape. A great edit has contrast — intense moments
   followed by breathing room, speed followed by slowdown. You're the editor, you decide
   what each clip needs based on what's actually in it.

For video clips: startTime and endTime (2-${MAX_CLIP_DURATION}s each — you decide the duration).
For photos: startTime=0, endTime=${PHOTO_DISPLAY_DURATION}.

Respond with ONLY a JSON object:
{"contentSummary": "Vivid 2-3 sentence description of the content and story", "theme": "party", "clips": [{"sourceFileId": "...", "startTime": 0, "endTime": 15, "label": "brief description", "confidenceScore": 0.9, "velocityPreset": "hero"}]}`;

  // Build a multimodal message: show the planner the actual frames
  const userContent: Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }> = [];

  userContent.push({
    type: "text",
    text: "Here are the top frames from the source footage. Watch them all carefully, understand what's happening, then plan the best possible highlight tape.\n",
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
    text: "\nNow analyze everything you see above. What's the story? What are the best moments? Create the highlight tape.",
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
 * Fallback velocity assignment based on clip position in the tape arc.
 * Used only when the AI planning call fails entirely.
 * Position-aware: hook → build → peak → resolve.
 */
function fallbackVelocity(index: number, total: number, isPhoto: boolean): string {
  if (isPhoto) return "normal";
  if (total <= 1) return "hero";

  const position = index / (total - 1); // 0.0 = first, 1.0 = last
  if (index === 0) return "hero";               // Hook: dramatic
  if (position < 0.4) return "ramp_in";         // Build: tension
  if (position < 0.7) return "bullet";          // Peak: impact
  if (index === total - 1) return "ramp_out";   // Resolve: decelerate
  return "montage";                              // Fill: rhythmic
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
  const totalSources = bySource.size;
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
        velocityPreset: fallbackVelocity(order, totalSources, false),
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
        velocityPreset: fallbackVelocity(i, sourceIds.length, false),
        order: i,
      });
    }
  });

  return clips;
}
