import type { ScoredFrame, MultiFrameInput } from "@/actions/detect";

// ── Debug logging ──
// Local copy of the detect.ts debug gate: a `"use server"` module can only export
// async functions, so debugLog cannot be imported from detect.ts. Behaviour-identical.
const DEBUG = process.env.NODE_ENV === "development" || process.env.DEBUG_DETECT === "1";
/** Debug-only logger — gated behind NODE_ENV or DEBUG_DETECT flag to avoid production noise. */
function debugLog(...args: unknown[]) {
  if (DEBUG) console.log(...args);
}

/** Build a lookup key from source file ID + timestamp with enough precision to avoid collisions.
 * Using 3 decimal places (ms precision) prevents the collisions that .toFixed(1) caused.
 *
 * Exported + imported back into detect.ts (used across several detection helpers), so the key
 * format stays single-sourced. */
export function frameKey(sourceFileId: string, timestamp: number): string {
  return `${sourceFileId}::${timestamp.toFixed(3)}`;
}

const API_MAX_IMAGES_DEFAULT = 60; // Video-heavy: planner has TEXT scores for ALL frames, images are for visual verification
const API_MAX_IMAGES_PHOTO_HEAVY = 150; // Photo-heavy: photos are ~20-50KB each, so 150 ≈ 3-7.5MB (well under 9MB budget)
const PHOTO_HEAVY_THRESHOLD = 0.5; // If ≥50% of source files are photos, use the higher cap
const API_IMAGE_PAYLOAD_BUDGET = 9 * 1024 * 1024; // 9 MB budget (480p/0.6 frames are ~20-50KB each)
const API_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per image

/**
 * Select frames for the planner — sends as many as the API allows.
 * Every source gets at least 1 frame, then fills remaining budget by score.
 *
 * Claude API hard limits (Messages API):
 * - 100 images per request
 * - 32 MB total payload
 * - 5 MB per individual image
 * We leave headroom for the system prompt + score text + JSON overhead.
 *
 * COGS-critical: this decides how many (and which) frames reach the planner, which drives
 * planner token cost and payload size. Pure + deterministic → unit-tested in
 * detect-planner-frames.test.ts.
 */
export function selectPlannerFrames(
  scores: ScoredFrame[],
  frames: MultiFrameInput[],
): MultiFrameInput[] {
  // Dynamically set frame cap: photos are small (~20-50KB) and each is a unique source,
  // so we can safely send more without blowing the payload budget.
  const uniqueSources = new Set(frames.map((f) => f.sourceFileId));
  const photoSources = new Set(frames.filter((f) => f.sourceType === "photo").map((f) => f.sourceFileId));
  const photoRatio = uniqueSources.size > 0 ? photoSources.size / uniqueSources.size : 0;
  const API_MAX_IMAGES = photoRatio >= PHOTO_HEAVY_THRESHOLD ? API_MAX_IMAGES_PHOTO_HEAVY : API_MAX_IMAGES_DEFAULT;
  debugLog(`Planner frame selection: ${uniqueSources.size} sources (${photoSources.size} photos, ratio=${photoRatio.toFixed(2)}), cap=${API_MAX_IMAGES}`);
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
