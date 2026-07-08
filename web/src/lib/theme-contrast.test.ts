import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

/**
 * Guards the design-token contrast contract. `--text-tertiary` powers placeholder /
 * helper text across the app (landing, editor, export, legal). At its old value
 * (0.4 white on --bg-primary) it rendered at ~3.78:1 — below the WCAG 2.1 AA floor
 * of 4.5:1 for normal-size text — so muted informational copy was failing AA.
 *
 * This test reads the REAL globals.css tokens, blends the semi-transparent white
 * text over the primary background, and asserts every user-facing text tier clears
 * AA. It fails LOUD if anyone reverts tertiary to a sub-AA opacity.
 */

const GLOBALS_CSS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "app",
  "globals.css",
);

const css = readFileSync(GLOBALS_CSS, "utf8");

function tokenValue(name: string): string {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  if (!m) throw new Error(`token --${name} not found in globals.css`);
  return m[1].trim();
}

/** Parse a hex (#RRGGBB) or rgba(r, g, b, a) token into rgb + alpha (0..1). */
function parseColor(value: string): { rgb: [number, number, number]; a: number } {
  const hex = value.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
  }
  const rgba = value.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/,
  );
  if (rgba) {
    return {
      rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  throw new Error(`unparseable color: ${value}`);
}

/** Composite a (possibly translucent) foreground over an opaque background. */
function composite(
  fg: { rgb: [number, number, number]; a: number },
  bg: [number, number, number],
): [number, number, number] {
  return fg.rgb.map((c, i) => Math.round(fg.a * c + (1 - fg.a) * bg[i])) as [
    number,
    number,
    number,
  ];
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const chan = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrast(
  fg: [number, number, number],
  bg: [number, number, number],
): number {
  const l1 = relLuminance(fg) + 0.05;
  const l2 = relLuminance(bg) + 0.05;
  return Math.max(l1, l2) / Math.min(l1, l2);
}

const AA_NORMAL = 4.5;

describe("design-token text contrast (WCAG AA)", () => {
  const bg = parseColor(tokenValue("bg-primary")).rgb;

  it.each(["text-secondary", "text-tertiary"])(
    "--%s clears AA 4.5:1 on --bg-primary",
    (token) => {
      const fg = composite(parseColor(tokenValue(token)), bg);
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it("--text-tertiary specifically is not the sub-AA 0.4 it used to be", () => {
    const { a } = parseColor(tokenValue("text-tertiary"));
    // 0.4 → ~3.78:1 (fails AA). Anything below 0.5 dips under the floor on --bg-primary.
    expect(a).toBeGreaterThanOrEqual(0.5);
  });
});
