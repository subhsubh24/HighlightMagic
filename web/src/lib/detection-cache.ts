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

export function cacheDetectionData(frames: ExtractedFrame[], scores: ScoredFrame[]) {
  _frames = frames;
  _scores = scores;
}

export function getCachedDetectionData(): { frames: ExtractedFrame[] | null; scores: ScoredFrame[] | null } {
  return { frames: _frames, scores: _scores };
}

export function clearDetectionCache() {
  _frames = null;
  _scores = null;
}
