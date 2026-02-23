import { describe, it, expect } from "vitest";
import {
  buildBeatGrid,
  snapToBeat,
  nextBeatAfter,
  getBeatPhase,
  getBeatIntensity,
  buildBeatSyncedTimeline,
  validateBeatSync,
  validateTimeline,
  type BeatGrid,
} from "./beat-sync";
import type { EditedClip, MusicTrack } from "./types";

// ── buildBeatGrid ──

describe("buildBeatGrid", () => {
  it("generates correct beat interval for 120 BPM", () => {
    const grid = buildBeatGrid(120, 10);
    expect(grid.bpm).toBe(120);
    expect(grid.beatInterval).toBe(0.5);
  });

  it("generates correct beat interval for 60 BPM", () => {
    const grid = buildBeatGrid(60, 5);
    expect(grid.beatInterval).toBe(1.0);
  });

  it("generates beats up to and beyond the duration", () => {
    const grid = buildBeatGrid(120, 2);
    // At 120 BPM, beatInterval = 0.5s. For 2s: 0, 0.5, 1.0, 1.5, 2.0, 2.5
    expect(grid.beats.length).toBeGreaterThanOrEqual(5);
    expect(grid.beats[0]).toBe(0);
    expect(grid.beats[1]).toBe(0.5);
    expect(grid.beats[2]).toBe(1.0);
  });

  it("rounds beat times to avoid floating point drift", () => {
    const grid = buildBeatGrid(140, 10);
    for (const beat of grid.beats) {
      // Each beat should be rounded to 3 decimal places
      expect(beat).toBe(Math.round(beat * 1000) / 1000);
    }
  });

  it("handles very high BPM", () => {
    const grid = buildBeatGrid(300, 2);
    expect(grid.beatInterval).toBe(0.2);
    expect(grid.beats.length).toBeGreaterThan(10);
  });

  it("handles very low BPM", () => {
    const grid = buildBeatGrid(30, 10);
    expect(grid.beatInterval).toBe(2.0);
    expect(grid.beats.length).toBeGreaterThanOrEqual(5);
  });
});

// ── snapToBeat ──

describe("snapToBeat", () => {
  const grid = buildBeatGrid(120, 10); // beats at 0, 0.5, 1.0, 1.5, ...

  it("snaps exactly on a beat", () => {
    expect(snapToBeat(0.5, grid)).toBe(0.5);
    expect(snapToBeat(1.0, grid)).toBe(1.0);
  });

  it("snaps to the nearest beat (closer to left)", () => {
    expect(snapToBeat(0.6, grid)).toBe(0.5);
    expect(snapToBeat(0.1, grid)).toBe(0);
  });

  it("snaps to the nearest beat (closer to right)", () => {
    expect(snapToBeat(0.4, grid)).toBe(0.5);
    expect(snapToBeat(0.9, grid)).toBe(1.0);
  });

  it("snaps midpoint to one of the two nearest beats", () => {
    const result = snapToBeat(0.25, grid);
    expect([0, 0.5]).toContain(result);
  });

  it("snaps time 0 to first beat", () => {
    expect(snapToBeat(0, grid)).toBe(0);
  });
});

// ── nextBeatAfter ──

describe("nextBeatAfter", () => {
  const grid = buildBeatGrid(120, 10); // beats at 0, 0.5, 1.0, 1.5, ...

  it("returns the same beat when exactly on a beat", () => {
    expect(nextBeatAfter(0.5, grid)).toBe(0.5);
  });

  it("returns the next beat when between beats", () => {
    expect(nextBeatAfter(0.1, grid)).toBe(0.5);
    expect(nextBeatAfter(0.6, grid)).toBe(1.0);
  });

  it("returns first beat for time 0", () => {
    expect(nextBeatAfter(0, grid)).toBe(0);
  });

  it("handles time just before a beat (within 1ms tolerance)", () => {
    // nextBeatAfter uses 0.001s tolerance
    expect(nextBeatAfter(0.4999, grid)).toBe(0.5);
  });
});

// ── getBeatPhase ──

describe("getBeatPhase", () => {
  const grid = buildBeatGrid(120, 10); // beatInterval = 0.5

  it("returns 0 at the start of a beat", () => {
    const phase = getBeatPhase(0, grid);
    expect(phase).toBeCloseTo(0, 5);
  });

  it("returns ~0.5 at the midpoint between beats", () => {
    const phase = getBeatPhase(0.25, grid);
    expect(phase).toBeCloseTo(0.5, 2);
  });

  it("returns close to 1 just before the next beat", () => {
    const phase = getBeatPhase(0.49, grid);
    expect(phase).toBeGreaterThan(0.9);
  });
});

// ── getBeatIntensity ──

describe("getBeatIntensity", () => {
  const grid = buildBeatGrid(120, 10); // beats at 0, 0.5, 1.0

  it("returns 1 exactly on a beat", () => {
    expect(getBeatIntensity(0.5, grid)).toBe(1);
  });

  it("returns 0 far from any beat", () => {
    // 0.25s away from nearest beat (0 or 0.5), tolerance is 50ms = 0.05s
    expect(getBeatIntensity(0.25, grid)).toBe(0);
  });

  it("returns a value between 0 and 1 near a beat", () => {
    // 20ms from beat at 0.5s
    const intensity = getBeatIntensity(0.52, grid, 50);
    expect(intensity).toBeGreaterThan(0);
    expect(intensity).toBeLessThan(1);
  });

  it("respects custom tolerance", () => {
    // 80ms away, with 100ms tolerance
    const intensity = getBeatIntensity(0.58, grid, 100);
    expect(intensity).toBeGreaterThan(0);
    // 80ms away, with 50ms tolerance
    expect(getBeatIntensity(0.58, grid, 50)).toBe(0);
  });
});

// ── validateBeatSync ──

describe("validateBeatSync", () => {
  const grid = buildBeatGrid(120, 10); // beats at 0, 0.5, 1.0, 1.5, ...

  it("returns perfect for a single clip", () => {
    const result = validateBeatSync([0], grid);
    expect(result.quality).toBe(1);
    expect(result.label).toBe("perfect");
    expect(result.totalTransitions).toBe(0);
  });

  it("returns perfect for clips exactly on beats", () => {
    const result = validateBeatSync([0, 0.5, 1.0, 1.5], grid);
    expect(result.quality).toBe(1);
    expect(result.label).toBe("perfect");
    expect(result.tightCount).toBe(3);
    expect(result.avgOffsetMs).toBe(0);
  });

  it("returns tight for clips within 33ms of beats", () => {
    // Offset by 20ms from each beat
    const result = validateBeatSync([0, 0.52, 1.02, 1.52], grid);
    expect(result.tightCount).toBe(3); // all within 33ms
    expect(result.quality).toBeGreaterThanOrEqual(0.85);
  });

  it("returns lower quality for clips far from beats", () => {
    // 200ms off each beat
    const result = validateBeatSync([0, 0.7, 1.2, 1.7], grid);
    expect(result.acceptableCount).toBeLessThan(result.totalTransitions);
    expect(result.quality).toBeLessThan(0.65);
  });

  it("computes correct avgOffsetMs", () => {
    // Clip starts at 0, then at 0.51 (10ms from 0.5), then at 1.03 (30ms from 1.0)
    const result = validateBeatSync([0, 0.51, 1.03], grid);
    expect(result.avgOffsetMs).toBeCloseTo(20, 0);
  });
});

// ── buildBeatSyncedTimeline ──

describe("buildBeatSyncedTimeline", () => {
  const mockTrack: MusicTrack = {
    id: "test",
    name: "Test",
    fileName: "test.mp3",
    artist: "Test",
    mood: "Upbeat",
    category: "General",
    bpm: 120,
    durationSeconds: 60,
    isPremium: false,
  };

  function makeClip(trimStart: number, trimEnd: number): EditedClip {
    return {
      id: `clip-${trimStart}`,
      sourceFileId: "src1",
      segment: { id: "s1", sourceFileId: "src1", startTime: trimStart, endTime: trimEnd, confidenceScore: 0.8, label: "test", detectionSources: [] },
      trimStart,
      trimEnd,
      order: 0,
      selectedMusicTrack: mockTrack,
      captionText: "",
      captionStyle: "Bold",
      selectedFilter: "None",
      velocityPreset: "normal",
    };
  }

  it("returns null when no music track", () => {
    const result = buildBeatSyncedTimeline([makeClip(0, 3)], null);
    expect(result).toBeNull();
  });

  it("snaps clip durations to whole number of beats", () => {
    const clips = [makeClip(0, 2.3), makeClip(0, 1.7)];
    const result = buildBeatSyncedTimeline(clips, mockTrack);
    expect(result).not.toBeNull();
    // At 120 BPM, beatInterval = 0.5s
    // 2.3s / 0.5 = 4.6 → rounds to 5 beats = 2.5s
    expect(result!.clipDurations[0]).toBe(2.5);
    // 1.7s / 0.5 = 3.4 → rounds to 3 beats = 1.5s (but min 2 beats = 1.0s)
    expect(result!.clipDurations[1]).toBe(1.5);
  });

  it("enforces minimum 2 beats per clip", () => {
    const clips = [makeClip(0, 0.3)]; // 0.3s → 0.6 beats → rounds to 1 → clamped to 2
    const result = buildBeatSyncedTimeline(clips, mockTrack);
    expect(result).not.toBeNull();
    expect(result!.clipDurations[0]).toBe(1.0); // 2 beats × 0.5s
  });

  it("accounts for transition overlap with beat snapping", () => {
    const clips = [makeClip(0, 2), makeClip(0, 2)];
    const result = buildBeatSyncedTimeline(clips, mockTrack);
    expect(result).not.toBeNull();
    // The raw second start would be (clipEnd - transitionDuration) = 2.0 - 0.3 = 1.7
    // But buildBeatSyncedTimeline snaps to nearest beat: snapToBeat(1.7) → 1.5
    // Verify the second clip start is beat-aligned
    const secondStart = result!.clipStarts[1];
    const beatInterval = result!.grid.beatInterval;
    const remainder = secondStart % beatInterval;
    expect(remainder).toBeCloseTo(0, 2); // should be on a beat boundary
    // Second clip starts before first clip ends (overlap exists)
    const firstClipEnd = result!.clipStarts[0] + result!.clipDurations[0];
    expect(secondStart).toBeLessThan(firstClipEnd);
  });

  it("total duration reflects overlap subtraction", () => {
    const clips = [makeClip(0, 2), makeClip(0, 2)];
    const result = buildBeatSyncedTimeline(clips, mockTrack);
    expect(result).not.toBeNull();
    const lastStart = result!.clipStarts[result!.clipStarts.length - 1];
    const lastDur = result!.clipDurations[result!.clipDurations.length - 1];
    expect(result!.totalDuration).toBe(lastStart + lastDur);
  });
});

// ── validateTimeline ──

describe("validateTimeline", () => {
  it("validates a correct timeline", () => {
    const clips = [
      { sourceFileId: "a", trimStart: 0, trimEnd: 3, sourceDuration: 10 },
      { sourceFileId: "b", trimStart: 1, trimEnd: 4, sourceDuration: 10 },
    ];
    const result = validateTimeline(clips, 0.3, null);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("catches negative duration", () => {
    const clips = [
      { sourceFileId: "a", trimStart: 5, trimEnd: 2 },
    ];
    const result = validateTimeline(clips, 0.3, null);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("negative_duration");
  });

  it("catches zero duration", () => {
    const clips = [
      { sourceFileId: "a", trimStart: 3, trimEnd: 3 },
    ];
    const result = validateTimeline(clips, 0.3, null);
    expect(result.valid).toBe(false);
    expect(result.issues[0].type).toBe("zero_duration");
  });

  it("warns when trimEnd exceeds source duration", () => {
    const clips = [
      { sourceFileId: "a", trimStart: 0, trimEnd: 15, sourceDuration: 10 },
    ];
    const result = validateTimeline(clips, 0.3, null);
    expect(result.valid).toBe(true); // warning, not error
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("exceeds_source");
    expect(result.issues[0].severity).toBe("warning");
  });

  it("includes beat-sync validation when grid is provided", () => {
    const grid = buildBeatGrid(120, 10);
    const clips = [
      { sourceFileId: "a", trimStart: 0, trimEnd: 3, sourceDuration: 10 },
      { sourceFileId: "b", trimStart: 0, trimEnd: 3, sourceDuration: 10 },
    ];
    const result = validateTimeline(clips, 0.3, grid);
    expect(result.beatSync).not.toBeNull();
    expect(result.beatSync!.totalTransitions).toBeGreaterThan(0);
  });

  it("returns null beatSync when no grid", () => {
    const clips = [
      { sourceFileId: "a", trimStart: 0, trimEnd: 3 },
    ];
    const result = validateTimeline(clips, 0.3, null);
    expect(result.beatSync).toBeNull();
  });
});
