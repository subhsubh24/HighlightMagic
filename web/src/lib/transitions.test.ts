import { describe, it, expect } from "vitest";
import {
  getClipAlpha,
  getTransitionTransform,
  getClipEntryScale,
  drawTransitionOverlay,
  type TransitionType,
} from "./transitions";

// ── Minimal canvas mock ──
// drawTransitionOverlay draws only onto the passed 2D context (plus createLinearGradient
// for light_leak), so a small recording stub is enough to assert the real render behaviour
// without a DOM. Each fillRect snapshots the fillStyle/globalAlpha in effect at draw time.
interface RectCall { x: number; y: number; w: number; h: number; fillStyle: unknown; alpha: number }
function makeCtx() {
  const rects: RectCall[] = [];
  const gradients: { stops: [number, string][] }[] = [];
  let saves = 0;
  let restores = 0;
  const ctx = {
    fillStyle: "" as unknown,
    globalAlpha: 1,
    save() { saves++; },
    restore() { restores++; },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, fillStyle: ctx.fillStyle, alpha: ctx.globalAlpha });
    },
    createLinearGradient() {
      const g = { stops: [] as [number, string][], addColorStop(o: number, c: string) { g.stops.push([o, c]); } };
      gradients.push(g);
      return g;
    },
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    rects,
    gradients,
    get saves() { return saves; },
    get restores() { return restores; },
  };
}

/** Full-frame rects (the overlay wash) drawn for a 100x200 canvas. */
function fullFrameRects(rects: RectCall[]): RectCall[] {
  return rects.filter((r) => r.x === 0 && r.y === 0 && r.w === 100 && r.h === 200);
}

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

describe("drawTransitionOverlay", () => {
  const W = 100;
  const H = 200;

  it("always balances save/restore for every transition type", () => {
    for (const type of ALL_TYPES) {
      const c = makeCtx();
      drawTransitionOverlay(c.ctx, W, H, type, 0.5);
      expect(c.saves, `${type} should call save once`).toBe(1);
      expect(c.restores, `${type} should call restore once`).toBe(1);
    }
  });

  it("transitions with no overlay (crossfade, soft_zoom, dip_to_black) draw nothing", () => {
    for (const type of ["crossfade", "soft_zoom", "dip_to_black"] as TransitionType[]) {
      const { ctx, rects, gradients } = makeCtx();
      drawTransitionOverlay(ctx, W, H, type, 0.5);
      expect(rects, `${type} should not fill any rect`).toHaveLength(0);
      expect(gradients, `${type} should not build a gradient`).toHaveLength(0);
    }
  });

  it("flash washes the full frame white, peaking in intensity at the midpoint", () => {
    const alphaAt = (progress: number) => {
      const { ctx, rects } = makeCtx();
      drawTransitionOverlay(ctx, W, H, "flash", progress);
      const frame = fullFrameRects(rects);
      expect(frame).toHaveLength(1);
      expect(String(frame[0].fillStyle)).toMatch(/^rgba\(255,255,255,/);
      return Number(String(frame[0].fillStyle).match(/,([^,)]+)\)$/)![1]);
    };
    // sin(pi*progress): 0 at the ends, max at 0.5.
    expect(alphaAt(0)).toBeCloseTo(0, 5);
    expect(alphaAt(1)).toBeCloseTo(0, 5);
    expect(alphaAt(0.5)).toBeGreaterThan(alphaAt(0.25));
    expect(alphaAt(0.5)).toBeCloseTo(0.85, 2); // default flashOverlayAlpha
  });

  it("scales all overlay alphas by transitionIntensity (0 → invisible wash)", () => {
    const { ctx, rects } = makeCtx();
    drawTransitionOverlay(ctx, W, H, "flash", 0.5, 0, undefined, undefined, 0);
    const frame = fullFrameRects(rects);
    expect(frame).toHaveLength(1);
    expect(Number(String(frame[0].fillStyle).match(/,([^,)]+)\)$/)![1])).toBeCloseTo(0, 5);
  });

  it("hard_flash runs dark → white-blast → fade across its three phases", () => {
    const rectFor = (progress: number) => {
      const { ctx, rects } = makeCtx();
      drawTransitionOverlay(ctx, W, H, "hard_flash", progress);
      return fullFrameRects(rects)[0];
    };
    // Phase 1 (progress < 0.3): darken with black.
    expect(String(rectFor(0.15).fillStyle)).toMatch(/^rgba\(0,0,0,/);
    // Phase 2 (0.3–0.55): solid white blast at full intensity.
    const blast = rectFor(0.45);
    expect(String(blast.fillStyle)).toBe("white");
    expect(blast.alpha).toBeCloseTo(1, 5);
    // Phase 3 (> 0.55): white fade-out.
    expect(String(rectFor(0.8).fillStyle)).toMatch(/^rgba\(255,255,255,/);
  });

  it("color_flash uses the AI-provided neon color", () => {
    const { ctx, rects } = makeCtx();
    drawTransitionOverlay(ctx, W, H, "color_flash", 0.5, 0, ["#ff0000"]);
    const frame = fullFrameRects(rects);
    expect(frame).toHaveLength(1);
    expect(String(frame[0].fillStyle)).toMatch(/^rgba\(255,0,0,/);
  });

  it("light_leak builds a 3-stop gradient wash", () => {
    const { ctx, rects, gradients } = makeCtx();
    drawTransitionOverlay(ctx, W, H, "light_leak", 0.5);
    expect(gradients).toHaveLength(1);
    expect(gradients[0].stops).toHaveLength(3);
    expect(fullFrameRects(rects)).toHaveLength(1);
  });

  it("hard_cut only bumps brightness inside the cut window", () => {
    const outside = makeCtx();
    drawTransitionOverlay(outside.ctx, W, H, "hard_cut", 0.1);
    expect(fullFrameRects(outside.rects)).toHaveLength(0); // no wash outside 0.4–0.6

    const inside = makeCtx();
    drawTransitionOverlay(inside.ctx, W, H, "hard_cut", 0.5);
    expect(fullFrameRects(inside.rects)).toHaveLength(1); // a brief white bump at the seam
  });

  it("renderOptions override the default flash opacity", () => {
    const { ctx, rects } = makeCtx();
    drawTransitionOverlay(ctx, W, H, "flash", 0.5, 0, undefined, { flashOverlayAlpha: 0.5 });
    const a = Number(String(fullFrameRects(rects)[0].fillStyle).match(/,([^,)]+)\)$/)![1]);
    expect(a).toBeCloseTo(0.5, 2); // sin(pi/2)=1 * 0.5
  });
});
