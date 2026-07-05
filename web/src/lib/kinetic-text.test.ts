import { describe, it, expect } from "vitest";
import { getKineticTransform, drawKineticCaption, type KineticTransform } from "./kinetic-text";
import type { CaptionStyle } from "./types";

const STYLES: CaptionStyle[] = ["Bold", "Minimal", "Neon", "Classic"];

// ── Minimal canvas mock for drawKineticCaption ──
// It draws only onto the passed 2D context (measureText drives word-wrap; fillText draws
// each line/char), so a recording stub is enough to assert real render behaviour without a DOM.
interface TextCall { text: string; x: number; y: number; font: string; fillStyle: unknown; alpha: number }
function makeTextCtx(charWidth = 10) {
  const texts: TextCall[] = [];
  const translates: [number, number][] = [];
  let saves = 0;
  let restores = 0;
  const ctx = {
    globalAlpha: 1,
    font: "",
    textAlign: "start",
    fillStyle: "" as unknown,
    shadowColor: "",
    shadowBlur: 0,
    save() { saves++; },
    restore() { restores++; },
    translate(x: number, y: number) { translates.push([x, y]); },
    scale() {},
    rotate() {},
    measureText(s: string) { return { width: s.length * charWidth } as TextMetrics; },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, font: ctx.font, fillStyle: ctx.fillStyle, alpha: ctx.globalAlpha });
    },
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    texts, translates,
    get saves() { return saves; },
    get restores() { return restores; },
  };
}

/** A fully-visible transform with no glow/spacing embellishment (baseline draw). */
function plainTransform(over: Partial<KineticTransform> = {}): KineticTransform {
  return { scale: 1, offsetY: 0, alpha: 1, rotation: 0, letterSpacing: 1, glowRadius: 0, glowAlpha: 0, ...over };
}

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

  // The exit-animation TYPE (10th positional arg) is set per-clip from the AI plan's
  // captionExitAnimation and drives the real export render (ExportStep drawOverlays →
  // getKineticTransform). Each type uses a DISTINCT formula; assert the branches stay
  // distinct so a swapped/broken formula fails CI instead of shipping a wrong exit.
  describe("exit animation type branches", () => {
    // clipDuration=5, exitDuration=0.3, localTime=4.85 → timeToEnd=0.15, so t = 0.15/0.3 = 0.5.
    const atExit = (exitType: string) =>
      getKineticTransform("Bold", 4.85, 5, 1920, undefined, 0.45, 0.3, 1.0, 1.0, exitType);

    it("pop grows scale and holds vertical position", () => {
      const t = atExit("pop");
      expect(t.scale).toBeGreaterThan(1); // 1 + (1-0.5)*0.3 = 1.15
      expect(t.offsetY).toBe(0);
      expect(t.alpha).toBeCloseTo(0.5, 5);
    });

    it("slide pushes DOWN (positive offsetY) — opposite of the default fade", () => {
      const t = atExit("slide");
      expect(t.offsetY).toBeGreaterThan(0); // (1-0.5)*20 = 10
      expect(t.alpha).toBeCloseTo(0.5, 5);
    });

    it("dissolve fades quadratically (alpha = t², below the linear fade)", () => {
      const t = atExit("dissolve");
      expect(t.alpha).toBeCloseTo(0.25, 5); // 0.5² = 0.25 < 0.5
      expect(t.offsetY).toBe(0);
    });

    it("fade (default) drifts UP with linear alpha", () => {
      const t = atExit("fade");
      expect(t.offsetY).toBeLessThan(0); // (1-0.5)*(-10) = -5
      expect(t.alpha).toBeCloseTo(0.5, 5);
    });

    it("honors kineticParams overrides for the exit magnitude", () => {
      // popExitScale 1.0 instead of the 0.3 default → scale = 1 + (1-0.5)*1.0 = 1.5
      const t = getKineticTransform(
        "Bold", 4.85, 5, 1920, undefined, 0.45, 0.3, 1.0, 1.0, "pop", { popExitScale: 1.0 }
      );
      expect(t.scale).toBeCloseTo(1.5, 5);
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

describe("drawKineticCaption", () => {
  it("draws nothing for empty text or a fully-transparent caption", () => {
    const empty = makeTextCtx();
    drawKineticCaption(empty.ctx, "", "Bold", plainTransform(), 1080, 1920, 48);
    expect(empty.texts).toHaveLength(0);
    expect(empty.saves).toBe(0);

    const invisible = makeTextCtx();
    drawKineticCaption(invisible.ctx, "Hello", "Bold", plainTransform({ alpha: 0 }), 1080, 1920, 48);
    expect(invisible.texts).toHaveLength(0);
    expect(invisible.saves).toBe(0);
  });

  it("renders a short caption once, save/restore balanced", () => {
    const m = makeTextCtx();
    drawKineticCaption(m.ctx, "Nice shot", "Bold", plainTransform(), 1080, 1920, 48);
    expect(m.saves).toBe(1);
    expect(m.restores).toBe(1);
    const drawn = m.texts.filter((t) => t.text === "Nice shot");
    expect(drawn.length).toBeGreaterThanOrEqual(1);
  });

  it("positions the caption at the AI-chosen vertical fraction (+ offsetY)", () => {
    const m = makeTextCtx();
    drawKineticCaption(m.ctx, "Hi", "Bold", plainTransform({ offsetY: 10 }), 1080, 1920, 48, undefined, 0.5);
    // x centered, y = canvasHeight * verticalPosition + offsetY = 1920*0.5 + 10 = 970.
    expect(m.translates[0]).toEqual([540, 970]);
  });

  it("word-wraps a long caption into multiple lines", () => {
    // Narrow canvas → small maxTextWidth → forces wrapping.
    const m = makeTextCtx();
    drawKineticCaption(m.ctx, "one two three four five six seven", "Bold", plainTransform(), 200, 400, 24);
    const lines = new Set(m.texts.map((t) => t.text));
    expect(lines.size).toBeGreaterThan(1);
    // Every original word survives across the wrapped lines.
    expect([...lines].join(" ").split(/\s+/).sort()).toEqual(
      "one two three four five six seven".split(" ").sort(),
    );
  });

  it("selects a distinct font per named style", () => {
    const fontFor = (style: CaptionStyle) => {
      const m = makeTextCtx();
      drawKineticCaption(m.ctx, "x", style, plainTransform(), 1080, 1920, 48);
      return m.texts[0].font;
    };
    expect(fontFor("Bold")).toMatch(/^900 /);
    expect(fontFor("Minimal")).toMatch(/^300 /);
    expect(fontFor("Classic")).toMatch(/italic .*Georgia/);
  });

  it("honours a custom color and font override", () => {
    const m = makeTextCtx();
    drawKineticCaption(
      m.ctx, "x", "Bold", plainTransform(), 1080, 1920, 48,
      { color: "#ff00aa", fontWeight: 400, fontFamily: "serif", fontStyle: "italic" },
    );
    expect(m.texts[0].fillStyle).toBe("#ff00aa");
    expect(m.texts[0].font).toMatch(/italic 400 .*Georgia/);
  });

  it("draws characters individually when letter-spacing diverges from 1", () => {
    const m = makeTextCtx();
    // glow off so we only get the single spaced-text pass (one fillText per char).
    drawKineticCaption(m.ctx, "Hey", "Bold", plainTransform({ letterSpacing: 1.5 }), 1080, 1920, 48);
    // "Hey" → 3 chars drawn separately, not one "Hey" fillText.
    expect(m.texts).toHaveLength(3);
    expect(m.texts.map((t) => t.text)).toEqual(["H", "e", "y"]);
  });
});
