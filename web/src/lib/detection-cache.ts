"use client";

/**
 * Module-level cache for extracted frames and scores.
 * Persists across component mount/unmount cycles so regeneration
 * can skip the expensive extraction + scoring phases and re-run
 * only the planner with user feedback.
 */

import type { ExtractedFrame } from "./frame-extractor";
import type { ScoredFrame } from "@/actions/detect";

let _frames: ExtractedFrame[] | null = null;
let _scores: ScoredFrame[] | null = null;
/** Fingerprint of the source files used for this cache — invalidate if sources change */
let _sourceFingerprint: string | null = null;

/** Build a fingerprint from media file names/sizes to detect project changes */
function buildFingerprint(sourceFiles: Array<{ name: string; size?: number }>): string {
  return sourceFiles.map((f) => `${f.name}:${f.size ?? 0}`).sort().join("|");
}

export function cacheDetectionData(
  frames: ExtractedFrame[],
  scores: ScoredFrame[],
  sourceFiles?: Array<{ name: string; size?: number }>
) {
  _frames = frames;
  _scores = scores;
  _sourceFingerprint = sourceFiles ? buildFingerprint(sourceFiles) : null;
}

export function getCachedDetectionData(
  sourceFiles?: Array<{ name: string; size?: number }>
): { frames: ExtractedFrame[] | null; scores: ScoredFrame[] | null } {
  // Invalidate cache if source files have changed (different video loaded)
  if (sourceFiles && _sourceFingerprint !== null) {
    const currentFp = buildFingerprint(sourceFiles);
    if (currentFp !== _sourceFingerprint) {
      clearDetectionCache();
      return { frames: null, scores: null };
    }
  }
  return { frames: _frames, scores: _scores };
}

export function clearDetectionCache() {
  _frames = null;
  _scores = null;
  _sourceFingerprint = null;
}
