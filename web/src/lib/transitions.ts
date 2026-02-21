/**
 * Sports-edit style transition effects.
 *
 * Inspired by NFL highlight reels / hype edits:
 *  - Flash cuts with bright pops
 *  - Zoom punches that hit hard
 *  - Whip pans for scene changes
 *  - Hard flashes for emphasis
 *  - Glitch / RGB-shift for energy
 */

export type TransitionType =
  | "flash"       // Quick white flash — most common in sports edits
  | "zoom_punch"  // Zoom in hard, cut, zoom out on new clip
  | "whip"        // Fast horizontal slide between clips
  | "hard_flash"  // Black → bright white → new clip (dramatic)
  | "glitch";     // RGB shift + horizontal slice displacement

export interface TransitionTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const SEQUENCE: TransitionType[] = [
  "flash",
  "zoom_punch",
  "whip",
  "hard_flash",
  "glitch",
];

/** Return a varied sequence of transition types for N clip boundaries. */
export function getTransitionSequence(count: number): TransitionType[] {
  return Array.from({ length: count }, (_, i) => SEQUENCE[i % SEQUENCE.length]);
}

// ── Per-clip alpha during a transition ──

/**
 * How visible should the outgoing / incoming clip be at a given transition progress?
 * Some transitions crossfade, others hard-cut at the midpoint.
 */
export function getClipAlpha(
  type: TransitionType,
  progress: number,
  isOutgoing: boolean
): number {
  switch (type) {
    // Hard cut at midpoint — the flash / zoom hides the seam
    case "hard_flash":
    case "zoom_punch":
    case "glitch":
      return isOutgoing ? (progress < 0.5 ? 1 : 0) : (progress < 0.5 ? 0 : 1);

    // Both clips visible (slide), full alpha
    case "whip":
      return 1;

    // Standard crossfade underneath the flash overlay
    case "flash":
    default:
      return isOutgoing ? 1 - progress : progress;
  }
}

// ── Spatial transform (scale / offset) ──

export function getTransitionTransform(
  type: TransitionType,
  progress: number,
  isOutgoing: boolean,
  canvasWidth: number
): TransitionTransform {
  switch (type) {
    case "zoom_punch": {
      if (isOutgoing) {
        // Zoom in hard on outgoing
        return { scale: 1 + progress * 0.25, offsetX: 0, offsetY: 0 };
      }
      // Incoming starts slightly zoomed, settles to normal
      return { scale: 1 + (1 - progress) * 0.18, offsetX: 0, offsetY: 0 };
    }

    case "whip": {
      if (isOutgoing) {
        // Outgoing slides off to the left
        const ease = progress * progress; // ease-in
        return { scale: 1, offsetX: -ease * canvasWidth, offsetY: 0 };
      }
      // Incoming slides in from the right
      const ease = 1 - (1 - progress) * (1 - progress); // ease-out
      return { scale: 1, offsetX: (1 - ease) * canvasWidth, offsetY: 0 };
    }

    case "glitch": {
      // Random-ish horizontal jitter (deterministic from progress)
      const jitter = Math.sin(progress * 47) * 12;
      return { scale: 1, offsetX: jitter, offsetY: 0 };
    }

    default:
      return { scale: 1, offsetX: 0, offsetY: 0 };
  }
}

// ── Overlay effects drawn ON TOP of the clip frames ──

export function drawTransitionOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  type: TransitionType,
  progress: number
) {
  ctx.save();

  switch (type) {
    case "flash": {
      // Bright white flash peaking in the middle
      const a = Math.sin(progress * Math.PI) * 0.85;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "zoom_punch": {
      // Subtle brightness punch accompanying the zoom
      const a = Math.sin(progress * Math.PI) * 0.35;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "whip": {
      // Horizontal motion-blur lines + slight brightness
      const intensity = Math.sin(progress * Math.PI);
      ctx.globalAlpha = intensity * 0.25;
      ctx.fillStyle = "white";
      const lineCount = 8;
      for (let i = 0; i < lineCount; i++) {
        const y = (h / lineCount) * i + (h / lineCount) * 0.5;
        ctx.fillRect(0, y - 1, w, 2);
      }
      // Slight overall brightness
      ctx.globalAlpha = intensity * 0.15;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case "hard_flash": {
      // Dramatic: darken → blast white → reveal new clip
      let a: number;
      if (progress < 0.3) {
        // Darken
        a = progress / 0.3;
        ctx.fillStyle = `rgba(0,0,0,${a * 0.7})`;
        ctx.fillRect(0, 0, w, h);
      } else if (progress < 0.55) {
        // Bright white blast
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, w, h);
      } else {
        // Fade from white
        a = 1 - (progress - 0.55) / 0.45;
        ctx.fillStyle = `rgba(255,255,255,${a * 0.95})`;
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }

    case "glitch": {
      // RGB-shift effect + horizontal scan-line artifacts
      const intensity = Math.sin(progress * Math.PI);

      // Colored vertical bands (simulates RGB channel offset)
      ctx.globalAlpha = intensity * 0.2;
      ctx.fillStyle = "rgba(255,0,80,0.4)";
      ctx.fillRect(0, 0, w * 0.34, h);
      ctx.fillStyle = "rgba(0,200,255,0.3)";
      ctx.fillRect(w * 0.66, 0, w * 0.34, h);

      // Horizontal scan-line artifacts
      ctx.globalAlpha = intensity * 0.4;
      ctx.fillStyle = "black";
      const sliceCount = 6;
      for (let i = 0; i < sliceCount; i++) {
        // Deterministic "random" positions based on progress
        const seed = Math.sin((i + 1) * 1337 + progress * 100);
        const y = ((seed + 1) / 2) * h;
        const sliceH = 3 + Math.abs(seed) * 8;
        ctx.fillRect(0, y, w, sliceH);
      }

      // Brief white flash at midpoint
      if (progress > 0.4 && progress < 0.6) {
        const flashA = 1 - Math.abs(progress - 0.5) / 0.1;
        ctx.globalAlpha = Math.max(0, flashA) * 0.6;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }
  }

  ctx.restore();
}

// ── Clip entry "punch" — subtle scale bump when each clip starts ──

export function getClipEntryScale(localTime: number): number {
  const dur = 0.12; // 120ms entry punch
  if (localTime >= dur) return 1;
  const p = localTime / dur;
  // Ease-out cubic: starts at 1.04x, settles to 1x
  const eased = 1 - Math.pow(1 - p, 3);
  return 1 + (1 - eased) * 0.04;
}
