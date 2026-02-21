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
import type { EditingStyle } from "./editing-styles";

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
function beatsPerClip(style: EditingStyle, clipDuration: number, beatInterval: number): number {
  const naturalBeats = clipDuration / beatInterval;
  // Round to nearest whole number of beats (minimum 2 beats per clip)
  return Math.max(2, Math.round(naturalBeats));
}

export function buildBeatSyncedTimeline(
  clips: EditedClip[],
  musicTrack: MusicTrack | null,
  style: EditingStyle
): BeatSyncedTimeline | null {
  if (!musicTrack || !musicTrack.bpm) return null;

  const grid = buildBeatGrid(musicTrack.bpm, 300); // generous upper bound
  const clipDurations: number[] = [];
  const clipStarts: number[] = [];
  const transitionBeats: number[][] = [];

  let currentTime = 0;

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const rawDuration = clip.trimEnd - clip.trimStart;
    const beats = beatsPerClip(style, rawDuration, grid.beatInterval);
    const syncedDuration = beats * grid.beatInterval;

    // Snap start to nearest beat
    const snappedStart = snapToBeat(currentTime, grid);
    clipStarts.push(snappedStart);
    clipDurations.push(syncedDuration);

    // Find beats that fall during the transition zone at the end of this clip
    if (i < clips.length - 1) {
      const transStart = snappedStart + syncedDuration - style.transitionDuration;
      const transEnd = snappedStart + syncedDuration;
      const tBeats = grid.beats.filter((b) => b >= transStart && b <= transEnd);
      transitionBeats.push(tBeats);
    }

    // Next clip starts at (this clip end) minus transition overlap
    currentTime = snappedStart + syncedDuration;
    if (i < clips.length - 1) {
      currentTime -= style.transitionDuration;
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
