/**
 * Transition rendering system.
 *
 * Each transition type defines:
 *  - how the outgoing / incoming clip alpha behaves
 *  - spatial transforms (scale, offset) applied to each clip
 *  - an overlay effect drawn on top of the composited clips
 *
 * Transition types are grouped by genre:
 *  High-energy (sports, fitness):  flash, zoom_punch, whip, hard_flash, glitch
 *  Smooth (cooking, travel, pets): crossfade, light_leak, soft_zoom
 *  Stylized (gaming, party):       color_flash, strobe, glitch
 *  Clean (vlog):                   hard_cut, dip_to_black
 */

export type TransitionType =
  // ── High-energy ──
  | "flash"           // Quick white flash between clips
  | "zoom_punch"      // Zoom in hard on outgoing, zoom out on incoming
  | "whip"            // Fast horizontal slide / wipe
  | "hard_flash"      // Darken → blast white → reveal (dramatic)
  | "glitch"          // RGB shift + horizontal scan-line artifacts
  // ── Smooth ──
  | "crossfade"       // Simple dissolve
  | "light_leak"      // Warm golden overlay during dissolve
  | "soft_zoom"       // Gentle zoom dissolve
  // ── Stylized ──
  | "color_flash"     // Neon-colored flash (purple, teal, pink)
  | "strobe"          // Rapid on/off flash (beat-sync feel)
  // ── Clean ──
  | "hard_cut"        // Near-instant cut with subtle brightness bump
  | "dip_to_black";   // Fade to black, then fade up

export interface TransitionTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

// ── Alpha (visibility) per clip during a transition ──

export function getClipAlpha(
  type: TransitionType,
  progress: number,
  isOutgoing: boolean
): number {
  switch (type) {
    // Crossfade family — both clips blend linearly
    case "crossfade":
    case "light_leak":
    case "soft_zoom":
    case "flash":
    case "color_flash":
      return isOutgoing ? 1 - progress : progress;

    // Hard cut at midpoint — effect hides the seam
    case "hard_flash":
    case "zoom_punch":
    case "glitch":
    case "hard_cut":
    case "strobe":
      return isOutgoing ? (progress < 0.5 ? 1 : 0) : (progress < 0.5 ? 0 : 1);

    // Whip — both visible (sliding), full alpha
    case "whip":
      return 1;

    // Dip to black — each clip visible only in its half
    case "dip_to_black": {
      if (isOutgoing) return progress < 0.5 ? 1 - progress * 2 : 0;
      return progress < 0.5 ? 0 : (progress - 0.5) * 2;
    }

    default:
      return isOutgoing ? 1 - progress : progress;
  }
}

// ── Spatial transforms (scale / offset) ──

export function getTransitionTransform(
  type: TransitionType,
  progress: number,
  isOutgoing: boolean,
  canvasWidth: number
): TransitionTransform {
  switch (type) {
    case "zoom_punch":
      return isOutgoing
        ? { scale: 1 + progress * 0.25, offsetX: 0, offsetY: 0 }
        : { scale: 1 + (1 - progress) * 0.18, offsetX: 0, offsetY: 0 };

    case "whip": {
      const easeIn = progress * progress;
      const easeOut = 1 - (1 - progress) * (1 - progress);
      return isOutgoing
        ? { scale: 1, offsetX: -easeIn * canvasWidth, offsetY: 0 }
        : { scale: 1, offsetX: (1 - easeOut) * canvasWidth, offsetY: 0 };
    }

    case "glitch": {
      const jitter = Math.sin(progress * 47) * 12;
      return { scale: 1, offsetX: jitter, offsetY: 0 };
    }

    case "soft_zoom":
      return isOutgoing
        ? { scale: 1 + progress * 0.04, offsetX: 0, offsetY: 0 }
        : { scale: 1 + (1 - progress) * 0.04, offsetX: 0, offsetY: 0 };

    default:
      return { scale: 1, offsetX: 0, offsetY: 0 };
  }
}

// ── Overlay effects drawn ON TOP of the composited clips ──

const NEON_COLORS = [
  [147, 51, 234],  // purple
  [6, 182, 212],   // teal
  [236, 72, 153],  // magenta
  [245, 158, 11],  // amber
];

export function drawTransitionOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  type: TransitionType,
  progress: number,
  /** Used for color variation in color_flash */
  seed: number = 0
) {
  ctx.save();

  switch (type) {
    // ── High-energy ──

    case "flash": {
      const a = Math.sin(progress * Math.PI) * 0.85;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "zoom_punch": {
      const a = Math.sin(progress * Math.PI) * 0.35;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "whip": {
      const intensity = Math.sin(progress * Math.PI);
      // Horizontal motion-blur lines
      ctx.globalAlpha = intensity * 0.25;
      ctx.fillStyle = "white";
      const lineCount = 8;
      for (let i = 0; i < lineCount; i++) {
        const y = (h / lineCount) * i + h / lineCount * 0.5;
        ctx.fillRect(0, y - 1, w, 2);
      }
      // Slight brightness
      ctx.globalAlpha = intensity * 0.15;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "hard_flash": {
      let a: number;
      if (progress < 0.3) {
        a = progress / 0.3;
        ctx.fillStyle = `rgba(0,0,0,${a * 0.7})`;
        ctx.fillRect(0, 0, w, h);
      } else if (progress < 0.55) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, w, h);
      } else {
        a = 1 - (progress - 0.55) / 0.45;
        ctx.fillStyle = `rgba(255,255,255,${a * 0.95})`;
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }

    case "glitch": {
      const intensity = Math.sin(progress * Math.PI);
      // RGB channel bands
      ctx.globalAlpha = intensity * 0.2;
      ctx.fillStyle = "rgba(255,0,80,0.4)";
      ctx.fillRect(0, 0, w * 0.34, h);
      ctx.fillStyle = "rgba(0,200,255,0.3)";
      ctx.fillRect(w * 0.66, 0, w * 0.34, h);
      // Scan-line artifacts
      ctx.globalAlpha = intensity * 0.4;
      ctx.fillStyle = "black";
      for (let i = 0; i < 6; i++) {
        const s = Math.sin((i + 1) * 1337 + progress * 100);
        const y = ((s + 1) / 2) * h;
        ctx.fillRect(0, y, w, 3 + Math.abs(s) * 8);
      }
      // Midpoint white pop
      if (progress > 0.4 && progress < 0.6) {
        const fa = 1 - Math.abs(progress - 0.5) / 0.1;
        ctx.globalAlpha = Math.max(0, fa) * 0.6;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }

    // ── Smooth ──

    case "crossfade":
      // Pure dissolve — no overlay needed
      break;

    case "light_leak": {
      // Warm golden glow peaking at midpoint
      const a = Math.sin(progress * Math.PI) * 0.35;
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, `rgba(255, 200, 100, ${a})`);
      gradient.addColorStop(0.5, `rgba(255, 170, 50, ${a * 0.8})`);
      gradient.addColorStop(1, `rgba(255, 220, 150, ${a * 0.5})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "soft_zoom":
      // The zoom transform handles the visual; no overlay needed
      break;

    // ── Stylized ──

    case "color_flash": {
      const [r, g, b] = NEON_COLORS[seed % NEON_COLORS.length];
      const a = Math.sin(progress * Math.PI) * 0.65;
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "strobe": {
      // 4 rapid flashes
      const flashCount = 4;
      const cycle = progress * flashCount;
      const phase = cycle - Math.floor(cycle);
      const a = phase < 0.5 ? phase * 2 * 0.9 : (1 - phase) * 2 * 0.9;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    // ── Clean ──

    case "hard_cut": {
      // Very brief, subtle brightness bump right at the cut
      if (progress > 0.4 && progress < 0.6) {
        const a = (1 - Math.abs(progress - 0.5) / 0.1) * 0.15;
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, a)})`;
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }

    case "dip_to_black":
      // The alpha logic handles the black; no extra overlay
      break;
  }

  ctx.restore();
}

// ── Clip entry "punch" — customizable per theme ──

export function getClipEntryScale(
  localTime: number,
  punchScale: number,
  punchDuration: number
): number {
  if (punchScale <= 1 || punchDuration <= 0 || localTime >= punchDuration) return 1;
  const p = localTime / punchDuration;
  const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
  return 1 + (1 - eased) * (punchScale - 1);
}
