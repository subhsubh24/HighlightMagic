/**
 * Beat-sync engine.
 *
 * Takes a BPM value (from the selected music track) and adjusts the clip
 * timeline so that transition boundaries land on beat hits.
 *
 * This is the single most important feature for viral-feeling edits —
 * research shows beat-synced cuts need to be accurate to within 1-2 frames
 * (33-66ms at 30fps) for the "satisfying" feeling.
 */

import type { EditedClip, MusicTrack } from "./types";
import { getEffectiveDuration } from "./velocity";

export interface BeatGrid {
  bpm: number;
  beatInterval: number; // seconds per beat
  /** Beat times in seconds (within the tape duration). */
  beats: number[];
}

/** Build a beat grid for the given BPM and total duration. */
export function buildBeatGrid(bpm: number, totalDuration: number): BeatGrid {
  const beatInterval = 60 / bpm;
  const beats: number[] = [];
  for (let t = 0; t <= totalDuration + beatInterval; t += beatInterval) {
    beats.push(Math.round(t * 1000) / 1000);
  }
  return { bpm, beatInterval, beats };
}

/** Snap a time value to the nearest beat in the grid. */
export function snapToBeat(time: number, grid: BeatGrid): number {
  let closest = grid.beats[0];
  let minDist = Math.abs(time - closest);
  for (const beat of grid.beats) {
    const dist = Math.abs(time - beat);
    if (dist < minDist) {
      minDist = dist;
      closest = beat;
    }
    if (beat > time + grid.beatInterval) break;
  }
  return closest;
}

/**
 * Find the nearest beat that is >= the given time.
 * Used to ensure clips don't start before a beat.
 */
export function nextBeatAfter(time: number, grid: BeatGrid): number {
  for (const beat of grid.beats) {
    if (beat >= time - 0.001) return beat;
  }
  return time;
}

/**
 * Build a beat-synced timeline from clips + music BPM.
 *
 * Strategy: keep each clip's total duration close to its original,
 * but adjust boundaries so transitions fall exactly on beats.
 * For high-energy themes (sports, gaming, party, fitness), we cut ON every
 * beat or every 2nd beat. For slower themes, we cut on every 2nd-4th beat.
 *
 * Returns adjusted trimEnd values for each clip.
 */
export interface BeatSyncedTimeline {
  /** Adjusted clip durations (in order). */
  clipDurations: number[];
  /** The global time at which each clip starts. */
  clipStarts: number[];
  /** Beat times that fall during transitions (for transition effects). */
  transitionBeats: number[][];
  /** The total duration of the beat-synced tape. */
  totalDuration: number;
  /** The beat grid used. */
  grid: BeatGrid;
}

/**
 * Determine how many beats each clip should span, based on theme energy.
 */
function beatsPerClip(clipDuration: number, beatInterval: number): number {
  const naturalBeats = clipDuration / beatInterval;
  // Round to nearest whole number of beats (minimum 2 beats per clip)
  return Math.max(2, Math.round(naturalBeats));
}

export function buildBeatSyncedTimeline(
  clips: EditedClip[],
  musicTrack: MusicTrack | null,
): BeatSyncedTimeline | null {
  if (!musicTrack || !musicTrack.bpm) return null;

  const grid = buildBeatGrid(musicTrack.bpm, 300); // generous upper bound
  const clipDurations: number[] = [];
  const clipStarts: number[] = [];
  const transitionBeats: number[][] = [];

  // Track cumulative beat count to avoid double-snapping drift.
  // Only snap the first clip's start; subsequent starts are computed from
  // cumulative beat-aligned durations minus transition overlaps.
  let cumulativeBeats = 0;

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const sourceDuration = clip.trimEnd - clip.trimStart;
    // Account for velocity/speed ramping — effective duration may differ from source duration
    const rawDuration = getEffectiveDuration(sourceDuration, clip.velocityPreset, clip.customVelocityKeyframes);
    const beats = beatsPerClip(rawDuration, grid.beatInterval);
    const syncedDuration = beats * grid.beatInterval;

    // Compute start from cumulative beats to avoid rounding drift
    const clipStart = cumulativeBeats * grid.beatInterval;
    clipStarts.push(clipStart);
    clipDurations.push(syncedDuration);

    // Find beats that fall during the transition zone at the end of this clip
    const clipTransDuration = clip.transitionDuration ?? 0.3;
    if (i < clips.length - 1) {
      const transStart = clipStart + syncedDuration - clipTransDuration;
      const transEnd = clipStart + syncedDuration;
      const tBeats = grid.beats.filter((b) => b >= transStart && b <= transEnd);
      transitionBeats.push(tBeats);
    }

    // Next clip starts at (this clip end) minus transition overlap, expressed in beats
    cumulativeBeats += beats;
    if (i < clips.length - 1) {
      // Subtract transition overlap in beat units (round to nearest beat, min 1 if overlap > 0)
      const rawOverlapBeats = clipTransDuration / grid.beatInterval;
      const overlapBeats = clipTransDuration > 0 ? Math.max(1, Math.round(rawOverlapBeats)) : 0;
      cumulativeBeats -= overlapBeats;
    }
  }

  const lastStart = clipStarts[clipStarts.length - 1] ?? 0;
  const lastDur = clipDurations[clipDurations.length - 1] ?? 0;
  const totalDuration = lastStart + lastDur;

  return { clipDurations, clipStarts, transitionBeats, totalDuration, grid };
}

/**
 * Get the current beat phase at a given time (0-1 within the current beat).
 * Useful for pulsing effects that sync to the rhythm.
 */
export function getBeatPhase(time: number, grid: BeatGrid): number {
  const posInBeat = (time % grid.beatInterval) / grid.beatInterval;
  return posInBeat;
}

/**
 * Check if the current time is "on" a beat (within tolerance).
 * Returns the intensity (0-1) where 1 = exactly on beat.
 */
export function getBeatIntensity(time: number, grid: BeatGrid, toleranceMs: number = 50): number {
  const toleranceSec = toleranceMs / 1000;
  for (const beat of grid.beats) {
    const dist = Math.abs(time - beat);
    if (dist <= toleranceSec) {
      return 1 - dist / toleranceSec;
    }
    if (beat > time + toleranceSec) break;
  }
  return 0;
}

// ── Beat-sync validation ──

export interface BeatAlignmentEntry {
  /** Clip index in the timeline (0-based). */
  clipIndex: number;
  /** The actual transition time in seconds. */
  transitionTime: number;
  /** The nearest beat time in seconds. */
  nearestBeat: number;
  /** Offset from the nearest beat in milliseconds. */
  offsetMs: number;
  /** Whether this transition is within the "tight" tolerance (33ms ≈ 1 frame at 30fps). */
  tight: boolean;
  /** Whether this transition is within the "acceptable" tolerance (66ms ≈ 2 frames at 30fps). */
  acceptable: boolean;
}

export interface BeatSyncValidation {
  /** Overall alignment quality 0-1 (1 = perfect). */
  quality: number;
  /** Descriptive quality label. */
  label: "perfect" | "tight" | "good" | "loose" | "off";
  /** Number of transitions checked. */
  totalTransitions: number;
  /** Number within tight tolerance (≤33ms). */
  tightCount: number;
  /** Number within acceptable tolerance (≤66ms). */
  acceptableCount: number;
  /** Average offset in milliseconds. */
  avgOffsetMs: number;
  /** Maximum offset in milliseconds. */
  maxOffsetMs: number;
  /** Per-transition details. */
  entries: BeatAlignmentEntry[];
}

/** Tight tolerance: 1 frame at 30fps = ~33ms. */
const TIGHT_TOLERANCE_MS = 33;
/** Acceptable tolerance: 2 frames at 30fps = ~66ms. */
const ACCEPTABLE_TOLERANCE_MS = 66;

/**
 * Validate how well clip transition boundaries align with the beat grid.
 *
 * Beat-synced cuts need to be accurate to within 1-2 frames (33-66ms at 30fps)
 * for the "satisfying" feeling. This function measures that alignment.
 *
 * @param clipStarts Array of global start times for each clip (in seconds).
 * @param grid The beat grid to validate against.
 * @returns A validation report with quality score and per-transition details.
 */
export function validateBeatSync(
  clipStarts: number[],
  grid: BeatGrid
): BeatSyncValidation {
  if (clipStarts.length < 2) {
    return {
      quality: 1,
      label: "perfect",
      totalTransitions: 0,
      tightCount: 0,
      acceptableCount: 0,
      avgOffsetMs: 0,
      maxOffsetMs: 0,
      entries: [],
    };
  }

  const entries: BeatAlignmentEntry[] = [];

  // Skip the first clip (no incoming transition) — validate transitions at clip 1+
  for (let i = 1; i < clipStarts.length; i++) {
    const t = clipStarts[i];
    const nearest = snapToBeat(t, grid);
    const offsetMs = Math.abs(t - nearest) * 1000;

    entries.push({
      clipIndex: i,
      transitionTime: t,
      nearestBeat: nearest,
      offsetMs: Math.round(offsetMs * 100) / 100,
      tight: offsetMs <= TIGHT_TOLERANCE_MS,
      acceptable: offsetMs <= ACCEPTABLE_TOLERANCE_MS,
    });
  }

  const totalTransitions = entries.length;
  const tightCount = entries.filter((e) => e.tight).length;
  const acceptableCount = entries.filter((e) => e.acceptable).length;
  const avgOffsetMs = totalTransitions > 0
    ? entries.reduce((sum, e) => sum + e.offsetMs, 0) / totalTransitions
    : 0;
  const maxOffsetMs = totalTransitions > 0
    ? Math.max(...entries.map((e) => e.offsetMs))
    : 0;

  // Quality score: weighted by how many transitions are within tolerance
  // Perfect = all within tight, good = all within acceptable, degrades from there
  let quality: number;
  if (totalTransitions === 0) {
    quality = 1;
  } else {
    const tightRatio = tightCount / totalTransitions;
    const acceptableRatio = acceptableCount / totalTransitions;
    // Tight transitions worth full points, acceptable worth 0.7, outside worth 0
    quality = (tightRatio * 1.0 + (acceptableRatio - tightRatio) * 0.7) ;
    quality = Math.max(0, Math.min(1, quality));
  }

  let label: BeatSyncValidation["label"];
  if (quality >= 0.95) label = "perfect";
  else if (quality >= 0.85) label = "tight";
  else if (quality >= 0.65) label = "good";
  else if (quality >= 0.4) label = "loose";
  else label = "off";

  return {
    quality,
    label,
    totalTransitions,
    tightCount,
    acceptableCount,
    avgOffsetMs: Math.round(avgOffsetMs * 100) / 100,
    maxOffsetMs: Math.round(maxOffsetMs * 100) / 100,
    entries,
  };
}

// ── Timeline validation ──

export interface TimelineIssue {
  clipIndex: number;
  type: "exceeds_source" | "negative_duration" | "zero_duration" | "overlap_gap";
  message: string;
  severity: "error" | "warning";
}

export interface TimelineValidation {
  valid: boolean;
  issues: TimelineIssue[];
  /** Beat-sync validation (null if no beat grid). */
  beatSync: BeatSyncValidation | null;
  /** Total rendered duration in seconds. */
  totalDuration: number;
}

/**
 * Validate the full rendering timeline: clip boundaries, durations,
 * and beat-sync alignment.
 *
 * Call this before export to catch issues that would produce broken output.
 */
export function validateTimeline(
  clips: Array<{
    sourceFileId: string;
    trimStart: number;
    trimEnd: number;
    sourceDuration?: number; // 0 for photos
    transitionDuration?: number;
  }>,
  defaultTransitionDuration: number,
  grid: BeatGrid | null
): TimelineValidation {
  const issues: TimelineIssue[] = [];
  const clipStarts: number[] = [];
  let t = 0;

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    let dur = clip.trimEnd - clip.trimStart;

    if (dur < 0) {
      issues.push({
        clipIndex: i,
        type: "negative_duration",
        message: `Clip ${i + 1} has negative duration (trimStart=${clip.trimStart}, trimEnd=${clip.trimEnd})`,
        severity: "error",
      });
      continue;
    }
    if (dur === 0) {
      issues.push({
        clipIndex: i,
        type: "zero_duration",
        message: `Clip ${i + 1} has zero duration`,
        severity: "error",
      });
      continue;
    }

    // Beat-sync snap
    if (grid && grid.beatInterval > 0) {
      const beats = Math.max(2, Math.round(dur / grid.beatInterval));
      dur = beats * grid.beatInterval;
    }

    // Source duration check
    if (clip.sourceDuration && clip.sourceDuration > 0 && clip.trimEnd > clip.sourceDuration + 0.5) {
      issues.push({
        clipIndex: i,
        type: "exceeds_source",
        message: `Clip ${i + 1} trimEnd (${clip.trimEnd.toFixed(1)}s) exceeds source duration (${clip.sourceDuration.toFixed(1)}s)`,
        severity: "warning",
      });
    }

    clipStarts.push(t);
    t += dur;
    if (i < clips.length - 1) {
      t -= clips[i + 1]?.transitionDuration ?? defaultTransitionDuration;
    }
  }

  const beatSyncValidation = grid ? validateBeatSync(clipStarts, grid) : null;

  return {
    valid: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    beatSync: beatSyncValidation,
    totalDuration: t,
  };
}
