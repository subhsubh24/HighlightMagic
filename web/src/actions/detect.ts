"use server";

import {
  MAX_FRAMES_PER_BATCH,
  HIGHLIGHT_CONFIDENCE_THRESHOLD,
  MIN_CLIP_DURATION,
  MAX_CLIP_DURATION,
  TARGET_CLIP_COUNT,
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

export interface DetectedClip {
  id: string;
  sourceFileId: string;
  startTime: number;
  endTime: number;
  confidenceScore: number;
  label: string;
  order: number;
}

// ── Legacy single-video detection (backward compat) ──

export async function detectHighlights(
  frames: FrameInput[],
  templateName?: string
): Promise<DetectedClip[]> {
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
): Promise<DetectedClip[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return simulateMultiDetection(frames);
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

  // After scoring all frames, do a second pass: ask Claude to create the highlight tape order
  const clips = await planHighlightTape(apiKey, allScores, sourceFiles, templateName);

  // Fall back to clustering if the planning call fails
  if (clips.length === 0) {
    return clusterMultiIntoClips(allScores);
  }

  return clips;
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

  const systemPrompt = `You are an expert video editor AI creating a highlight tape / TikTok-style edit from multiple source clips and photos.

SOURCE FILES:
${sourceList}

Analyze each frame and score it from 0.0 to 1.0 for "highlight potential" — how worthy it is of being in a viral highlight reel.

Consider:
- Visual excitement, motion, emotion, composition
- How well this moment would flow in a montage
- Variety — moments that add different energy (action, reaction, beauty, humor)
- Photos can be great for transitions, intros, or emotional beats
${templateName ? `\nStyle context: ${templateName} template` : ""}

Respond with ONLY a JSON array:
[{"index": 0, "score": 0.85, "label": "brief description of moment"}]`;

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
async function planHighlightTape(
  apiKey: string,
  scores: MultiFrameScore[],
  sourceFiles: Map<string, { name: string; type: "video" | "photo"; frameCount: number }>,
  templateName?: string
): Promise<DetectedClip[]> {
  const sourceList = Array.from(sourceFiles.entries())
    .map(([id, info]) => `- "${info.name}" (${info.type}, ID: ${id})`)
    .join("\n");

  // Send top-scoring moments as text (no images needed for planning)
  const topScores = [...scores]
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map((s) => `fileID:${s.sourceFileId} type:${s.sourceType} t:${s.timestamp.toFixed(1)}s score:${s.score.toFixed(2)} "${s.label}"`)
    .join("\n");

  const systemPrompt = `You are an expert video editor creating a TikTok / Reels highlight tape from multiple source clips and photos.

SOURCE FILES:
${sourceList}

TOP SCORING MOMENTS (from AI frame analysis):
${topScores}

Create a highlight tape of up to ${TARGET_CLIP_COUNT} segments that flows together like a professional edit.
Think about:
- Opening with a strong hook
- Building energy, pacing, and variety
- Mixing different source files for a montage feel
- Using photos as transition beats or establishing shots (${PHOTO_DISPLAY_DURATION}s each)
- Ending with a peak moment or satisfying conclusion
${templateName ? `Style: ${templateName}` : ""}

For video clips: specify a startTime and endTime (${MIN_CLIP_DURATION}-${MAX_CLIP_DURATION}s each).
For photos: startTime=0, endTime=${PHOTO_DISPLAY_DURATION}.

Respond with ONLY a JSON array in ORDER of playback:
[{"sourceFileId": "...", "startTime": 0, "endTime": 15, "label": "brief description", "confidenceScore": 0.9}]`;

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
        messages: [{ role: "user", content: "Create the highlight tape." }],
      }),
    });

    if (!response.ok) {
      console.error("Planning API error:", response.status);
      return [];
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      sourceFileId: string;
      startTime: number;
      endTime: number;
      label: string;
      confidenceScore: number;
    }>;

    return parsed.map((p, i) => ({
      id: crypto.randomUUID(),
      sourceFileId: p.sourceFileId,
      startTime: Math.max(0, p.startTime),
      endTime: p.endTime,
      confidenceScore: Math.max(0, Math.min(1, p.confidenceScore)),
      label: p.label || "Highlight",
      order: i,
    }));
  } catch (err) {
    console.error("Planning error:", err);
    return [];
  }
}

/**
 * Fallback clustering for multi-source clips.
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
    if (clips.length >= TARGET_CLIP_COUNT) break;

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
        order: order++,
      });
    } else {
      const nearby = fileScores.filter(
        (f) =>
          Math.abs(f.timestamp - best.timestamp) <= MAX_CLIP_DURATION / 2 &&
          f.score >= HIGHLIGHT_CONFIDENCE_THRESHOLD * 0.7
      );

      const timestamps = nearby.map((f) => f.timestamp);
      const minT = Math.min(...timestamps);
      const maxT = Math.max(...timestamps);
      const center = (minT + maxT) / 2;
      const halfDur = Math.max(MIN_CLIP_DURATION / 2, (maxT - minT) / 2);

      clips.push({
        id: crypto.randomUUID(),
        sourceFileId,
        startTime: Math.round(Math.max(0, center - halfDur) * 10) / 10,
        endTime: Math.round(Math.min(center + halfDur, center + MAX_CLIP_DURATION / 2) * 10) / 10,
        confidenceScore: Math.round((nearby.reduce((s, f) => s + f.score, 0) / nearby.length) * 100) / 100,
        label: best.label,
        order: order++,
      });
    }
  }

  return clips.sort((a, b) => a.order - b.order);
}

/**
 * Simulated multi-clip detection when no API key is configured.
 */
function simulateMultiDetection(frames: MultiFrameInput[]): DetectedClip[] {
  const sourceIds = [...new Set(frames.map((f) => f.sourceFileId))];
  const clips: DetectedClip[] = [];

  sourceIds.forEach((sourceId, i) => {
    if (clips.length >= TARGET_CLIP_COUNT) return;

    const sourceFrames = frames.filter((f) => f.sourceFileId === sourceId);
    const isPhoto = sourceFrames[0]?.sourceType === "photo";

    if (isPhoto) {
      clips.push({
        id: crypto.randomUUID(),
        sourceFileId: sourceId,
        startTime: 0,
        endTime: PHOTO_DISPLAY_DURATION,
        confidenceScore: Math.round((0.9 - i * 0.08) * 100) / 100,
        label: "Photo moment",
        order: i,
      });
    } else {
      const maxTime = sourceFrames[sourceFrames.length - 1]?.timestamp ?? 30;
      const center = maxTime / 2;
      const halfDur = MIN_CLIP_DURATION / 2 + Math.random() * 5;
      clips.push({
        id: crypto.randomUUID(),
        sourceFileId: sourceId,
        startTime: Math.max(0, center - halfDur),
        endTime: Math.min(maxTime, center + halfDur),
        confidenceScore: Math.round((0.95 - i * 0.1) * 100) / 100,
        label: ["Opening hook", "Action moment", "Peak energy", "Key scene", "Closing shot"][i % 5],
        order: i,
      });
    }
  });

  return clips;
}
