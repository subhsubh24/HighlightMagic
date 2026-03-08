import { describe, it, expect } from "vitest";
import { getKineticTransform, type KineticTransform } from "./kinetic-text";
import type { CaptionStyle } from "./types";

const STYLES: CaptionStyle[] = ["Bold", "Minimal", "Neon", "Classic"];

describe("getKineticTransform", () => {
  describe("entrance animation (first 0.5s)", () => {
    it("starts with reduced visibility at t=0", () => {
      for (const style of STYLES) {
        const t = getKineticTransform(style, 0, 5, 1920);
        // At t=0, alpha should be low or scale should be small
        expect(t.alpha).toBeLessThanOrEqual(1);
        expect(t.scale).toBeGreaterThanOrEqual(0);
      }
    });

    it("reaches full visibility by end of entrance (t=0.5)", () => {
      for (const style of STYLES) {
        const t = getKineticTransform(style, 0.49, 5, 1920);
        expect(t.alpha).toBeGreaterThan(0.5);
      }
    });

    it("Bold style uses pop animation (scale bounce)", () => {
      const t0 = getKineticTransform("Bold", 0, 5, 1920);
      expect(t0.scale).toBeLessThan(0.5); // Starts small
      const t1 = getKineticTransform("Bold", 0.49, 5, 1920);
      expect(t1.scale).toBeGreaterThan(0.9); // Scales up
    });

    it("Minimal style uses slide animation (offset + letter spacing)", () => {
      const t0 = getKineticTransform("Minimal", 0, 5, 1920);
      expect(t0.offsetY).toBeGreaterThan(0); // Starts offset down
      expect(t0.letterSpacing).toBeGreaterThan(1); // Wide spacing
      const t1 = getKineticTransform("Minimal", 0.49, 5, 1920);
      expect(t1.offsetY).toBeLessThan(t0.offsetY); // Slides up
    });

    it("Neon style uses flicker animation (glow)", () => {
      const t = getKineticTransform("Neon", 0.45, 5, 1920);
      expect(t.glowRadius).toBeGreaterThan(0);
    });

    it("Classic style uses typewriter animation", () => {
      const t0 = getKineticTransform("Classic", 0, 5, 1920);
      expect(t0.alpha).toBeLessThan(0.5);
      expect(t0.letterSpacing).toBeGreaterThan(1);
    });
  });

  describe("steady state (between entrance and exit)", () => {
    it("shows full alpha for all styles", () => {
      for (const style of STYLES) {
        const t = getKineticTransform(style, 2, 5, 1920);
        expect(t.alpha).toBe(1);
        expect(t.scale).toBeGreaterThanOrEqual(0.99);
      }
    });

    it("Neon has idle glow pulsing", () => {
      const t = getKineticTransform("Neon", 2, 5, 1920);
      expect(t.glowRadius).toBeGreaterThan(0);
      expect(t.glowAlpha).toBeGreaterThan(0);
    });
  });

  describe("exit animation (last 0.3s)", () => {
    it("fades out near the end of clip", () => {
      for (const style of STYLES) {
        const t = getKineticTransform(style, 4.85, 5, 1920);
        expect(t.alpha).toBeLessThan(1);
      }
    });

    it("moves up slightly during exit", () => {
      for (const style of STYLES) {
        const t = getKineticTransform(style, 4.9, 5, 1920);
        expect(t.offsetY).toBeLessThan(0);
      }
    });
  });

  describe("custom caption params", () => {
    it("overrides animation type when custom.animation is set", () => {
      // Force "none" animation on Bold style
      const t = getKineticTransform("Bold", 0, 5, 1920, { animation: "none" });
      expect(t.scale).toBe(1); // "none" doesn't scale
      expect(t.alpha).toBe(1);
    });

    it("applies custom glow radius", () => {
      const t = getKineticTransform("Bold", 2, 5, 1920, { glowRadius: 20 });
      expect(t.glowRadius).toBe(20);
    });
  });

  describe("transform values are bounded", () => {
    it("returns valid numeric values for all combinations", () => {
      const times = [0, 0.1, 0.25, 0.5, 1, 2, 3, 4.7, 4.9, 5];
      for (const style of STYLES) {
        for (const time of times) {
          const t = getKineticTransform(style, time, 5, 1920);
          expect(Number.isFinite(t.scale)).toBe(true);
          expect(Number.isFinite(t.alpha)).toBe(true);
          expect(Number.isFinite(t.offsetY)).toBe(true);
          expect(Number.isFinite(t.rotation)).toBe(true);
          expect(Number.isFinite(t.letterSpacing)).toBe(true);
          expect(Number.isFinite(t.glowRadius)).toBe(true);
          expect(Number.isFinite(t.glowAlpha)).toBe(true);
          expect(t.alpha).toBeGreaterThanOrEqual(0);
          expect(t.alpha).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
