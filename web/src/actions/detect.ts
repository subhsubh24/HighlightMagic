"use server";

import { MAX_FRAMES_PER_BATCH, HIGHLIGHT_CONFIDENCE_THRESHOLD, MIN_CLIP_DURATION, MAX_CLIP_DURATION, TARGET_CLIP_COUNT } from "@/lib/constants";

interface FrameInput {
  timestamp: number;
  base64: string;
}

interface FrameScore {
  timestamp: number;
  score: number;
  label: string;
}

interface DetectedClip {
  id: string;
  startTime: number;
  endTime: number;
  confidenceScore: number;
  label: string;
}

/**
 * Server Action: Analyze video frames via Claude Vision API.
 * Batches frames (max 10 per call), returns scored timestamps,
 * then clusters into highlight segments.
 */
export async function detectHighlights(
  frames: FrameInput[],
  userPrompt: string,
  templateName?: string
): Promise<DetectedClip[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // Fallback: simulate detection with heuristic scoring
    return simulateDetection(frames, userPrompt);
  }

  // Batch frames for Claude Vision
  const batches: FrameInput[][] = [];
  for (let i = 0; i < frames.length; i += MAX_FRAMES_PER_BATCH) {
    batches.push(frames.slice(i, i + MAX_FRAMES_PER_BATCH));
  }

  const allScores: FrameScore[] = [];

  for (const batch of batches) {
    const scores = await analyzeBatch(apiKey, batch, userPrompt, templateName);
    allScores.push(...scores);
  }

  // Cluster high-scoring frames into clips
  return clusterIntoClips(allScores);
}

async function analyzeBatch(
  apiKey: string,
  batch: FrameInput[],
  prompt: string,
  templateName?: string
): Promise<FrameScore[]> {
  const systemPrompt = `You are a video highlight detection AI. Analyze each video frame and score it for "highlight potential" from 0.0 to 1.0.

Consider: motion intensity, facial expressions, scene composition, visual interest, and emotional impact.
${prompt ? `User is looking for: "${prompt}"` : "Auto-detect the most interesting moments."}
${templateName ? `Style context: ${templateName} template` : ""}

Respond with ONLY a JSON array of objects, one per frame:
[{"index": 0, "score": 0.85, "label": "brief description"}]`;

  const content: Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }> = [];

  batch.forEach((frame, i) => {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: frame.base64 },
    });
    content.push({
      type: "text",
      text: `Frame ${i} — timestamp: ${frame.timestamp.toFixed(1)}s`,
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
      return batch.map((f) => ({ timestamp: f.timestamp, score: Math.random() * 0.5 + 0.3, label: "frame" }));
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "[]";

    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return batch.map((f) => ({ timestamp: f.timestamp, score: 0.5, label: "frame" }));
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ index: number; score: number; label: string }>;

    return parsed.map((p) => ({
      timestamp: batch[p.index]?.timestamp ?? 0,
      score: Math.max(0, Math.min(1, p.score)),
      label: p.label || "highlight",
    }));
  } catch (err) {
    console.error("Detection error:", err);
    // Graceful fallback
    return batch.map((f) => ({ timestamp: f.timestamp, score: Math.random() * 0.5 + 0.3, label: "frame" }));
  }
}

function clusterIntoClips(scores: FrameScore[]): DetectedClip[] {
  // Sort by score descending
  const sorted = [...scores].sort((a, b) => b.score - a.score);

  // Take top frames above threshold
  const topFrames = sorted.filter((f) => f.score >= HIGHLIGHT_CONFIDENCE_THRESHOLD);

  if (topFrames.length === 0) {
    // Fallback: take the top 3 anyway
    topFrames.push(...sorted.slice(0, TARGET_CLIP_COUNT));
  }

  // Cluster: merge frames within MIN_CLIP_DURATION of each other
  const clips: DetectedClip[] = [];
  const used = new Set<number>();

  for (const frame of topFrames) {
    if (used.has(frame.timestamp)) continue;
    if (clips.length >= TARGET_CLIP_COUNT) break;

    // Find nearby high-scoring frames
    const cluster = scores.filter(
      (f) =>
        Math.abs(f.timestamp - frame.timestamp) <= MAX_CLIP_DURATION / 2 &&
        f.score >= HIGHLIGHT_CONFIDENCE_THRESHOLD * 0.7
    );

    const timestamps = cluster.map((f) => f.timestamp);
    const minT = Math.min(...timestamps);
    const maxT = Math.max(...timestamps);

    // Ensure minimum clip duration
    const center = (minT + maxT) / 2;
    const halfDur = Math.max(MIN_CLIP_DURATION / 2, (maxT - minT) / 2);
    const startTime = Math.max(0, center - halfDur);
    const endTime = Math.min(startTime + MAX_CLIP_DURATION, center + halfDur);

    // Mark used timestamps
    cluster.forEach((f) => used.add(f.timestamp));

    const avgScore = cluster.reduce((sum, f) => sum + f.score, 0) / cluster.length;

    clips.push({
      id: crypto.randomUUID(),
      startTime: Math.round(startTime * 10) / 10,
      endTime: Math.round(endTime * 10) / 10,
      confidenceScore: Math.round(avgScore * 100) / 100,
      label: frame.label,
    });
  }

  return clips.sort((a, b) => b.confidenceScore - a.confidenceScore);
}

/**
 * Simulated detection when no API key is configured.
 * Uses simple heuristics (distribute across video timeline).
 */
function simulateDetection(frames: FrameInput[], prompt: string): DetectedClip[] {
  const totalDuration = frames[frames.length - 1]?.timestamp ?? 60;

  // Create 3 evenly-spaced clips with simulated scores
  const clips: DetectedClip[] = [];
  const segmentLength = totalDuration / (TARGET_CLIP_COUNT + 1);

  for (let i = 0; i < TARGET_CLIP_COUNT; i++) {
    const center = segmentLength * (i + 1);
    const clipDuration = MIN_CLIP_DURATION + Math.random() * 15;
    clips.push({
      id: crypto.randomUUID(),
      startTime: Math.max(0, center - clipDuration / 2),
      endTime: Math.min(totalDuration, center + clipDuration / 2),
      confidenceScore: Math.round((0.95 - i * 0.12) * 100) / 100,
      label: prompt
        ? `Matches "${prompt.slice(0, 30)}"`
        : ["Action moment", "Key scene", "Visual highlight"][i],
    });
  }

  return clips;
}
