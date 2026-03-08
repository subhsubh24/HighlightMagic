import { describe, it, expect } from "vitest";
import {
  getClipAlpha,
  getTransitionTransform,
  getClipEntryScale,
  type TransitionType,
} from "./transitions";

const ALL_TYPES: TransitionType[] = [
  "flash", "zoom_punch", "whip", "hard_flash", "glitch",
  "crossfade", "light_leak", "soft_zoom",
  "color_flash", "strobe",
  "hard_cut", "dip_to_black",
];

describe("getClipAlpha", () => {
  it("returns 1 for outgoing at progress 0", () => {
    for (const type of ALL_TYPES) {
      expect(getClipAlpha(type, 0, true)).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns values between 0 and 1", () => {
    for (const type of ALL_TYPES) {
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        const outgoing = getClipAlpha(type, p, true);
        const incoming = getClipAlpha(type, p, false);
        expect(outgoing).toBeGreaterThanOrEqual(0);
        expect(outgoing).toBeLessThanOrEqual(1);
        expect(incoming).toBeGreaterThanOrEqual(0);
        expect(incoming).toBeLessThanOrEqual(1);
      }
    }
  });

  it("crossfade family fades linearly", () => {
    expect(getClipAlpha("crossfade", 0, true)).toBe(1);
    expect(getClipAlpha("crossfade", 1, true)).toBe(0);
    expect(getClipAlpha("crossfade", 0, false)).toBe(0);
    expect(getClipAlpha("crossfade", 1, false)).toBe(1);
  });

  it("hard_cut switches at midpoint", () => {
    expect(getClipAlpha("hard_cut", 0.3, true)).toBe(1);
    expect(getClipAlpha("hard_cut", 0.7, true)).toBe(0);
    expect(getClipAlpha("hard_cut", 0.3, false)).toBe(0);
    expect(getClipAlpha("hard_cut", 0.7, false)).toBe(1);
  });

  it("whip keeps both clips at full alpha", () => {
    expect(getClipAlpha("whip", 0.5, true)).toBe(1);
    expect(getClipAlpha("whip", 0.5, false)).toBe(1);
  });

  it("dip_to_black fades out then in", () => {
    // Outgoing fades to 0 in first half
    expect(getClipAlpha("dip_to_black", 0, true)).toBe(1);
    expect(getClipAlpha("dip_to_black", 0.5, true)).toBe(0);
    // Incoming fades in from 0 in second half
    expect(getClipAlpha("dip_to_black", 0.5, false)).toBe(0);
    expect(getClipAlpha("dip_to_black", 1, false)).toBe(1);
  });
});

describe("getTransitionTransform", () => {
  it("returns identity transform for simple transitions", () => {
    const t = getTransitionTransform("crossfade", 0.5, true, 1080);
    expect(t.scale).toBe(1);
    expect(t.offsetX).toBe(0);
    expect(t.offsetY).toBe(0);
  });

  it("zoom_punch scales up outgoing clip", () => {
    const t = getTransitionTransform("zoom_punch", 0.5, true, 1080);
    expect(t.scale).toBeGreaterThan(1);
  });

  it("whip offsets clips horizontally", () => {
    const outgoing = getTransitionTransform("whip", 0.5, true, 1080);
    const incoming = getTransitionTransform("whip", 0.5, false, 1080);
    expect(outgoing.offsetX).toBeLessThan(0); // Slides left
    expect(incoming.offsetX).toBeGreaterThan(0); // Slides in from right
  });

  it("glitch produces jitter offset", () => {
    const t = getTransitionTransform("glitch", 0.5, true, 1080);
    expect(t.scale).toBe(1);
    expect(t.offsetY).toBe(0);
    // offsetX varies with sin function
  });
});

describe("getClipEntryScale", () => {
  it("returns 1 when no punch is configured", () => {
    expect(getClipEntryScale(0, 1.0, 0)).toBe(1);
    expect(getClipEntryScale(0, 1.0, 0.2)).toBe(1);
  });

  it("returns punch scale at time 0", () => {
    const scale = getClipEntryScale(0, 1.05, 0.2);
    expect(scale).toBeCloseTo(1.05, 2);
  });

  it("returns 1 after punch duration", () => {
    expect(getClipEntryScale(0.3, 1.05, 0.2)).toBe(1);
  });

  it("decays from punch scale to 1 over duration", () => {
    const mid = getClipEntryScale(0.1, 1.05, 0.2);
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(1.05);
  });
});
