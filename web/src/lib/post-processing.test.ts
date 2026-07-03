import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  applyEasing,
  getMicroSettle,
  getExitDeceleration,
  getWarmthShiftCSS,
  drawFilmGrain,
  drawVignette,
  applyFilmStock,
} from "./post-processing";

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

// ── Canvas render paths (drawFilmGrain / drawVignette / applyFilmStock) ──
// These run on every exported frame with a film-stock / grade applied. They draw
// onto the passed 2D context and spin up cached offscreen canvases via
// document.createElement — so we stub a minimal DOM canvas (node env has none) and
// a recording main context, then assert the real render behaviour.

interface DrawCall { image: unknown; args: number[]; composite: string; alpha: number }
interface FillCall { fillStyle: unknown; composite: string; x: number; y: number; w: number; h: number }

function makeMainCtx() {
  const draws: DrawCall[] = [];
  const fills: FillCall[] = [];
  const filters: string[] = [];
  let saves = 0;
  let restores = 0;
  const ctx = {
    canvas: { width: 100, height: 200 },
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: true,
    fillStyle: "" as unknown,
    _filter: "none",
    get filter() { return this._filter; },
    set filter(v: string) { this._filter = v; filters.push(v); },
    save() { saves++; },
    restore() { restores++; },
    drawImage(image: unknown, ...args: number[]) {
      draws.push({ image, args, composite: ctx.globalCompositeOperation, alpha: ctx.globalAlpha });
    },
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ fillStyle: ctx.fillStyle, composite: ctx.globalCompositeOperation, x, y, w, h });
    },
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    draws, fills, filters,
    get saves() { return saves; },
    get restores() { return restores; },
  };
}

// Minimal offscreen 2D context for the cached grain/vignette canvases.
function makeOffscreenCtx() {
  return {
    fillStyle: "" as unknown,
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {},
  };
}

let restoreDocument: () => void;
beforeAll(() => {
  const g = globalThis as { document?: unknown };
  const had = "document" in g;
  const prev = g.document;
  g.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => makeOffscreenCtx() }),
  };
  restoreDocument = () => { if (had) g.document = prev; else delete g.document; };
});
afterAll(() => restoreDocument());

describe("drawFilmGrain", () => {
  it("is a no-op when opacity is zero", () => {
    const m = makeMainCtx();
    drawFilmGrain(m.ctx, 100, 200, 0);
    expect(m.draws).toHaveLength(0);
    expect(m.saves).toBe(0);
  });

  it("draws the grain layer in 'overlay' composite at the given opacity", () => {
    const m = makeMainCtx();
    drawFilmGrain(m.ctx, 100, 200, 0.05);
    expect(m.saves).toBe(1);
    expect(m.restores).toBe(1);
    expect(m.draws).toHaveLength(1);
    // Grain is composited as "overlay" at the requested opacity, scaled to the frame.
    expect(m.draws[0].composite).toBe("overlay");
    expect(m.draws[0].alpha).toBeCloseTo(0.05, 6);
    expect(m.draws[0].args).toEqual([0, 0, 100, 200]);
  });
});

describe("drawVignette", () => {
  it("is a no-op when intensity is zero", () => {
    const m = makeMainCtx();
    drawVignette(m.ctx, 100, 200, 0);
    expect(m.draws).toHaveLength(0);
    expect(m.saves).toBe(0);
  });

  it("draws the vignette layer at the given intensity", () => {
    const m = makeMainCtx();
    drawVignette(m.ctx, 100, 200, 0.2);
    expect(m.saves).toBe(1);
    expect(m.restores).toBe(1);
    expect(m.draws).toHaveLength(1);
    expect(m.draws[0].alpha).toBeCloseTo(0.2, 6);
  });
});

describe("applyFilmStock", () => {
  it("is a no-op when no stock is provided", () => {
    const m = makeMainCtx();
    applyFilmStock(m.ctx, 100, 200, undefined);
    expect(m.draws).toHaveLength(0);
    expect(m.fills).toHaveLength(0);
    expect(m.filters).toHaveLength(0);
  });

  it("applies a warm (sepia) filter for positive warmth and resets it", () => {
    const m = makeMainCtx();
    applyFilmStock(m.ctx, 100, 200, { grain: 0, warmth: 0.3, contrast: 1.0, fadedBlacks: 0 });
    expect(m.filters.some((f) => f.includes("sepia(0.300"))).toBe(true);
    // The filter must be reset so it doesn't bleed into later draws.
    expect(m.filters[m.filters.length - 1]).toBe("none");
  });

  it("uses hue-rotate for negative warmth (cool cast)", () => {
    const m = makeMainCtx();
    applyFilmStock(m.ctx, 100, 200, { grain: 0, warmth: -0.5, contrast: 1.0, fadedBlacks: 0 });
    expect(m.filters.some((f) => f.includes("hue-rotate"))).toBe(true);
    expect(m.filters.some((f) => f.includes("sepia"))).toBe(false);
  });

  it("includes a contrast term only when contrast diverges from 1.0", () => {
    const none = makeMainCtx();
    applyFilmStock(none.ctx, 100, 200, { grain: 0, warmth: 0, contrast: 1.0, fadedBlacks: 0 });
    expect(none.filters).toHaveLength(0); // nothing to apply → no filter set at all

    const some = makeMainCtx();
    applyFilmStock(some.ctx, 100, 200, { grain: 0, warmth: 0, contrast: 1.2, fadedBlacks: 0 });
    expect(some.filters.some((f) => f.includes("contrast(1.200"))).toBe(true);
  });

  it("lifts blacks with a 'lighten' gray wash scaled by fadedBlacks", () => {
    const m = makeMainCtx();
    applyFilmStock(m.ctx, 100, 200, { grain: 0, warmth: 0, contrast: 1.0, fadedBlacks: 0.1 });
    const wash = m.fills.find((f) => f.composite === "lighten");
    expect(wash).toBeDefined();
    // gray = round(0.1 * 255) = 26 (0x1A).
    expect(wash!.fillStyle).toBe("rgb(26,26,26)");
  });

  it("adds film grain when the stock requests it", () => {
    const m = makeMainCtx();
    applyFilmStock(m.ctx, 100, 200, { grain: 0.04, warmth: 0, contrast: 1.0, fadedBlacks: 0 });
    // The grain overlay draw is the tell-tale of drawFilmGrain being invoked.
    expect(m.draws.some((d) => d.composite === "overlay")).toBe(true);
  });
});
