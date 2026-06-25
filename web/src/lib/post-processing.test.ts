import { describe, it, expect } from "vitest";
import { applyEasing, getMicroSettle, getExitDeceleration, getWarmthShiftCSS } from "./post-processing";

describe("applyEasing", () => {
  it("returns 0 at t=0 for all easings", () => {
    for (const e of ["linear", "quad", "expo", "cubic"]) {
      expect(applyEasing(0, e)).toBeCloseTo(0, 6);
    }
  });

  it("returns 1 at t=1 for all easings", () => {
    for (const e of ["linear", "quad", "expo", "cubic"]) {
      expect(applyEasing(1, e)).toBeCloseTo(1, 6);
    }
  });

  it("linear is identity", () => {
    expect(applyEasing(0.3, "linear")).toBeCloseTo(0.3, 6);
    expect(applyEasing(0.7, "linear")).toBeCloseTo(0.7, 6);
  });

  it("quad is monotone between 0 and 1", () => {
    const values = [0, 0.25, 0.5, 0.75, 1].map((t) => applyEasing(t, "quad"));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it("cubic is monotone between 0 and 1", () => {
    const values = [0, 0.25, 0.5, 0.75, 1].map((t) => applyEasing(t, "cubic"));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it("expo is monotone between 0 and 1", () => {
    const values = [0, 0.25, 0.5, 0.75, 1].map((t) => applyEasing(t, "expo"));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it("easing values are ≥ linear for deceleration easings (slow-out)", () => {
    for (const e of ["quad", "cubic", "expo"]) {
      const mid = applyEasing(0.5, e);
      expect(mid).toBeGreaterThan(0.5);
    }
  });

  it("unknown easing falls through to cubic", () => {
    expect(applyEasing(0.5, "bogus")).toBeCloseTo(applyEasing(0.5, "cubic"), 10);
  });
});

describe("getMicroSettle", () => {
  it("returns scale=1 offsetY=0 when elapsed >= settleDuration", () => {
    const result = getMicroSettle(0.2, 1.006, 0.18, "cubic");
    expect(result.scale).toBe(1);
    expect(result.offsetY).toBe(0);
  });

  it("returns scale=1 offsetY=0 when settleScale ≤ 1", () => {
    const result = getMicroSettle(0.0, 1.0, 0.18, "cubic");
    expect(result.scale).toBe(1);
    expect(result.offsetY).toBe(0);
  });

  it("returns scale=1 offsetY=0 when settleDuration ≤ 0", () => {
    const result = getMicroSettle(0.0, 1.006, 0, "cubic");
    expect(result.scale).toBe(1);
    expect(result.offsetY).toBe(0);
  });

  it("at t=0 scale equals settleScale", () => {
    const result = getMicroSettle(0.0, 1.006, 0.18, "cubic");
    expect(result.scale).toBeCloseTo(1.006, 5);
  });

  it("at t=0 offsetY is non-zero (negative, pulling element up)", () => {
    const result = getMicroSettle(0.0, 1.006, 0.18, "cubic");
    expect(result.offsetY).toBeLessThan(0);
  });

  it("scale converges toward 1 over the settle window", () => {
    const t0 = getMicroSettle(0.0, 1.006, 0.18, "cubic");
    const tMid = getMicroSettle(0.09, 1.006, 0.18, "cubic");
    expect(tMid.scale).toBeLessThan(t0.scale);
    expect(tMid.scale).toBeGreaterThanOrEqual(1);
  });

  it("uses default arguments correctly", () => {
    const explicit = getMicroSettle(0.0, 1.006, 0.18, "cubic");
    const defaulted = getMicroSettle(0.0);
    expect(defaulted.scale).toBeCloseTo(explicit.scale, 10);
    expect(defaulted.offsetY).toBeCloseTo(explicit.offsetY, 10);
  });
});

describe("getExitDeceleration", () => {
  it("returns 1.0 when minSpeed >= 1", () => {
    expect(getExitDeceleration(0, 5, 1.0, 0.14, "quad")).toBe(1.0);
    expect(getExitDeceleration(0, 5, 1.5, 0.14, "quad")).toBe(1.0);
  });

  it("returns 1.0 when decelDuration <= 0", () => {
    expect(getExitDeceleration(0, 5, 0.96, 0, "quad")).toBe(1.0);
  });

  it("returns 1.0 when far from clip end", () => {
    expect(getExitDeceleration(0, 5, 0.96, 0.14, "quad")).toBe(1.0);
  });

  it("returns 1.0 when elapsed >= clipDuration", () => {
    expect(getExitDeceleration(5, 5, 0.96, 0.14, "quad")).toBe(1.0);
    expect(getExitDeceleration(6, 5, 0.96, 0.14, "quad")).toBe(1.0);
  });

  it("applies deceleration during final window", () => {
    // At 4.93s into a 5s clip with 0.14s decel window: remaining=0.07s, t=0.5
    const speed = getExitDeceleration(4.93, 5.0, 0.96, 0.14, "quad");
    expect(speed).toBeLessThan(1.0);
    expect(speed).toBeGreaterThanOrEqual(0.96);
  });

  it("speed decreases as clip approaches end", () => {
    const s1 = getExitDeceleration(4.9, 5.0, 0.96, 0.14, "quad");
    const s2 = getExitDeceleration(4.95, 5.0, 0.96, 0.14, "quad");
    expect(s2).toBeLessThanOrEqual(s1);
  });

  it("uses default arguments correctly", () => {
    const explicit = getExitDeceleration(4.93, 5.0, 0.96, 0.14, "quad");
    const defaulted = getExitDeceleration(4.93, 5.0);
    expect(defaulted).toBeCloseTo(explicit, 10);
  });
});

describe("getWarmthShiftCSS", () => {
  it("returns null when warmth=false", () => {
    expect(getWarmthShiftCSS(0, 10, false)).toBeNull();
  });

  it("returns null when far from clip end", () => {
    expect(getWarmthShiftCSS(0, 10, true)).toBeNull();
    expect(getWarmthShiftCSS(7, 10, true)).toBeNull();
  });

  it("returns CSS string near clip end", () => {
    const css = getWarmthShiftCSS(9, 10, true);
    expect(css).not.toBeNull();
    expect(css).toMatch(/sepia\(/);
    expect(css).toMatch(/saturate\(/);
  });

  it("CSS values increase as clip approaches end", () => {
    const css1 = getWarmthShiftCSS(8.5, 10, true)!;
    const css2 = getWarmthShiftCSS(9.5, 10, true)!;
    const sepia1 = parseFloat(css1.match(/sepia\(([^)]+)\)/)![1]);
    const sepia2 = parseFloat(css2.match(/sepia\(([^)]+)\)/)![1]);
    expect(sepia2).toBeGreaterThan(sepia1);
  });

  it("custom warmth object overrides defaults", () => {
    const css = getWarmthShiftCSS(9.5, 10, { sepia: 0.12, saturation: 0.08, fadeIn: 2.0 });
    expect(css).not.toBeNull();
    const sepia = parseFloat(css!.match(/sepia\(([^)]+)\)/)![1]);
    const defaultCss = getWarmthShiftCSS(9.5, 10, true)!;
    const defaultSepia = parseFloat(defaultCss.match(/sepia\(([^)]+)\)/)![1]);
    expect(sepia).toBeGreaterThan(defaultSepia);
  });

  it("saturate value is > 1 (boost, not reduce)", () => {
    const css = getWarmthShiftCSS(9.5, 10, true)!;
    const sat = parseFloat(css.match(/saturate\(([^)]+)\)/)![1]);
    expect(sat).toBeGreaterThan(1);
  });
});
