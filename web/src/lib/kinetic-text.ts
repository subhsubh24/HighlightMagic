/**
 * Kinetic typography system.
 *
 * Animates caption text with entrance effects that make the edit feel
 * professional and "satisfying." Each CaptionStyle maps to a specific
 * animation that matches its personality.
 *
 * All animations are designed to complete within 0.5s so text is readable
 * for the remainder of the clip (research: minimum 0.5s readability).
 */

import type { CaptionStyle } from "./types";

export interface KineticTransform {
  /** Scale factor (1.0 = normal). */
  scale: number;
  /** Vertical offset in pixels (positive = down). */
  offsetY: number;
  /** Opacity (0-1). */
  alpha: number;
  /** Rotation in degrees. */
  rotation: number;
  /** Letter spacing multiplier (1.0 = normal). */
  letterSpacing: number;
  /** Glow radius in pixels (0 = none). */
  glowRadius: number;
  /** Glow alpha (0-1). */
  glowAlpha: number;
}

const ANIMATION_DURATION = 0.5; // seconds

/**
 * Get the kinetic transform for a caption at a given time within the clip.
 *
 * @param style - The caption style
 * @param localTime - Seconds since the clip started
 * @param clipDuration - Total clip duration in seconds
 * @param canvasHeight - Canvas height for scaling offsets
 */
export function getKineticTransform(
  style: CaptionStyle,
  localTime: number,
  clipDuration: number,
  canvasHeight: number
): KineticTransform {
  const base: KineticTransform = {
    scale: 1,
    offsetY: 0,
    alpha: 1,
    rotation: 0,
    letterSpacing: 1,
    glowRadius: 0,
    glowAlpha: 0,
  };

  // Entrance animation (first 0.5s)
  if (localTime < ANIMATION_DURATION) {
    const t = localTime / ANIMATION_DURATION;
    return getEntranceAnimation(style, t, canvasHeight);
  }

  // Exit animation (last 0.3s) — gentle fade
  const exitDuration = 0.3;
  const timeToEnd = clipDuration - localTime;
  if (timeToEnd < exitDuration && timeToEnd >= 0) {
    const t = timeToEnd / exitDuration;
    return { ...base, alpha: t, offsetY: (1 - t) * -10 };
  }

  // Steady state — apply style-specific idle effects
  return getIdleAnimation(style, localTime);
}

/**
 * Entrance animations per style.
 * t goes from 0 (start) to 1 (fully entered).
 */
function getEntranceAnimation(
  style: CaptionStyle,
  t: number,
  canvasHeight: number
): KineticTransform {
  switch (style) {
    case "Bold": {
      // Pop — scale from 0 → 1.15 → 1.0 with bounce
      const bounceT = easeOutBack(t);
      const scale = bounceT * 1.0;
      return {
        scale: Math.max(0.01, scale),
        offsetY: 0,
        alpha: Math.min(1, t * 3),
        rotation: 0,
        letterSpacing: 1,
        glowRadius: 0,
        glowAlpha: 0,
      };
    }

    case "Minimal": {
      // Slide up + fade in — elegant entrance
      const eased = easeOutCubic(t);
      return {
        scale: 1,
        offsetY: (1 - eased) * (canvasHeight * 0.03),
        alpha: eased,
        rotation: 0,
        letterSpacing: 1 + (1 - eased) * 0.5, // letters start spread, converge
        glowRadius: 0,
        glowAlpha: 0,
      };
    }

    case "Neon": {
      // Flicker on — simulates neon sign turning on
      const flickerPhase = t * 8;
      const flicker = t < 0.4
        ? (Math.sin(flickerPhase * Math.PI * 5) > 0 ? 0.8 : 0.1)
        : 1;
      const glow = easeOutCubic(Math.max(0, (t - 0.3) / 0.7));
      return {
        scale: 1,
        offsetY: 0,
        alpha: flicker,
        rotation: 0,
        letterSpacing: 1,
        glowRadius: glow * 20,
        glowAlpha: glow * 0.8,
      };
    }

    case "Classic": {
      // Typewriter — characters appear left to right (simulated via alpha + clip)
      const eased = easeOutQuad(t);
      return {
        scale: 1,
        offsetY: 0,
        alpha: eased,
        rotation: 0,
        letterSpacing: 1 + (1 - eased) * 0.2,
        glowRadius: 0,
        glowAlpha: 0,
      };
    }

    default:
      return {
        scale: 1,
        offsetY: 0,
        alpha: easeOutCubic(t),
        rotation: 0,
        letterSpacing: 1,
        glowRadius: 0,
        glowAlpha: 0,
      };
  }
}

/**
 * Idle animations — subtle ongoing effects per style.
 */
function getIdleAnimation(style: CaptionStyle, time: number): KineticTransform {
  const base: KineticTransform = {
    scale: 1,
    offsetY: 0,
    alpha: 1,
    rotation: 0,
    letterSpacing: 1,
    glowRadius: 0,
    glowAlpha: 0,
  };

  switch (style) {
    case "Neon": {
      // Subtle glow pulse
      const pulse = 0.6 + Math.sin(time * 3) * 0.2;
      return {
        ...base,
        glowRadius: 15 + Math.sin(time * 2) * 5,
        glowAlpha: pulse,
      };
    }

    case "Bold": {
      // Very subtle scale breathing
      return {
        ...base,
        scale: 1 + Math.sin(time * 1.5) * 0.008,
      };
    }

    default:
      return base;
  }
}

/**
 * Draw a caption with kinetic transforms applied.
 */
export function drawKineticCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: CaptionStyle,
  transform: KineticTransform,
  canvasWidth: number,
  canvasHeight: number,
  fontSize: number
) {
  if (!text || transform.alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, transform.alpha));

  // Position: bottom area, centered
  const x = canvasWidth / 2;
  const y = canvasHeight * 0.89 + transform.offsetY;

  ctx.translate(x, y);
  ctx.scale(transform.scale, transform.scale);
  ctx.rotate((transform.rotation * Math.PI) / 180);

  // Font setup per style
  switch (style) {
    case "Bold":
      ctx.font = `900 ${fontSize * 1.2}px -apple-system, sans-serif`;
      break;
    case "Minimal":
      ctx.font = `300 ${fontSize * 0.9}px -apple-system, sans-serif`;
      break;
    case "Neon":
      ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
      break;
    case "Classic":
      ctx.font = `italic ${fontSize}px Georgia, serif`;
      break;
    default:
      ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
  }

  ctx.textAlign = "center";

  // Letter spacing (applied by drawing characters individually if needed)
  if (transform.letterSpacing !== 1 && Math.abs(transform.letterSpacing - 1) > 0.05) {
    drawSpacedText(ctx, text, 0, 0, transform.letterSpacing, style, transform);
  } else {
    // Glow effect (for Neon)
    if (transform.glowRadius > 0 && transform.glowAlpha > 0) {
      ctx.shadowColor = `rgba(124, 58, 234, ${transform.glowAlpha})`;
      ctx.shadowBlur = transform.glowRadius;
      ctx.fillStyle = "white";
      ctx.fillText(text, 0, 0);

      // Second glow layer (pink)
      ctx.shadowColor = `rgba(236, 72, 153, ${transform.glowAlpha * 0.7})`;
      ctx.shadowBlur = transform.glowRadius * 1.5;
      ctx.fillText(text, 0, 0);

      ctx.shadowBlur = 0;
    }

    // Main text
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "white";
    ctx.fillText(text, 0, 0);
  }

  ctx.restore();
}

function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  style: CaptionStyle,
  transform: KineticTransform
) {
  const chars = text.split("");
  const baseWidths = chars.map((c) => ctx.measureText(c).width);
  const totalWidth = baseWidths.reduce((sum, w) => sum + w * spacing, 0);
  let currentX = x - totalWidth / 2;

  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "white";

  if (style === "Neon" && transform.glowRadius > 0) {
    ctx.shadowColor = `rgba(124, 58, 234, ${transform.glowAlpha})`;
    ctx.shadowBlur = transform.glowRadius;
  }

  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], currentX + baseWidths[i] / 2, y);
    currentX += baseWidths[i] * spacing;
  }
}

// ── Easing functions ──

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
