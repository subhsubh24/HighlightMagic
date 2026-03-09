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

/** AI-authored caption customizations. When present, override the named CaptionStyle defaults. */
export interface CustomCaptionParams {
  fontWeight?: number;       // 100-900
  fontStyle?: string;        // 'normal' | 'italic'
  fontFamily?: string;       // 'sans-serif' | 'serif' | 'mono'
  color?: string;            // hex e.g. "#ffffff"
  animation?: string;        // 'pop' | 'slide' | 'flicker' | 'typewriter' | 'fade' | 'none'
  glowColor?: string;        // hex e.g. "#7c3aed"
  glowRadius?: number;       // 0-30
}

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

const DEFAULT_ENTRANCE_DURATION = 0.5; // seconds
const DEFAULT_EXIT_DURATION = 0.3; // seconds

/**
 * Get the kinetic transform for a caption at a given time within the clip.
 *
 * @param style - The caption style
 * @param localTime - Seconds since the clip started
 * @param clipDuration - Total clip duration in seconds
 * @param canvasHeight - Canvas height for scaling offsets
 * @param custom - Custom caption parameters from AI
 * @param entranceDuration - AI-decided entrance animation duration (defaults to 0.5s)
 * @param exitDuration - AI-decided exit animation duration (defaults to 0.3s)
 * @param animationIntensity - Per-clip animation intensity (0-1). Scales entrance effect magnitude.
 */
export function getKineticTransform(
  style: CaptionStyle,
  localTime: number,
  clipDuration: number,
  canvasHeight: number,
  custom?: CustomCaptionParams,
  entranceDuration: number = DEFAULT_ENTRANCE_DURATION,
  exitDuration: number = DEFAULT_EXIT_DURATION,
  animationIntensity: number = 1.0
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

  // Resolve animation type: custom overrides named style
  const animation = custom?.animation ?? styleToAnimation(style);

  // Entrance animation — intensity scales the effect magnitude
  if (localTime < entranceDuration) {
    const t = localTime / entranceDuration;
    const raw = getEntranceAnimationByType(animation, t, canvasHeight, custom);
    if (animationIntensity < 1.0) {
      const ai = Math.max(0, Math.min(1, animationIntensity));
      return {
        scale: 1 + (raw.scale - 1) * ai,
        offsetY: raw.offsetY * ai,
        alpha: 1 - (1 - raw.alpha) * ai,
        rotation: raw.rotation * ai,
        letterSpacing: 1 + (raw.letterSpacing - 1) * ai,
        glowRadius: raw.glowRadius * ai,
        glowAlpha: raw.glowAlpha * ai,
      };
    }
    return raw;
  }

  // Exit animation — gentle fade
  const timeToEnd = clipDuration - localTime;
  if (timeToEnd < exitDuration && timeToEnd >= 0) {
    const t = timeToEnd / exitDuration;
    return { ...base, alpha: t, offsetY: (1 - t) * -10 };
  }

  // Steady state — apply idle effects based on animation type
  return getIdleAnimationByType(animation, localTime, custom);
}

/** Map named caption styles to their default animation type. */
function styleToAnimation(style: CaptionStyle): string {
  switch (style) {
    case "Bold": return "pop";
    case "Minimal": return "slide";
    case "Neon": return "flicker";
    case "Classic": return "typewriter";
    default: return "fade";
  }
}

/**
 * Entrance animations by animation type (decoupled from named CaptionStyle).
 * t goes from 0 (start) to 1 (fully entered).
 */
function getEntranceAnimationByType(
  animation: string,
  t: number,
  canvasHeight: number,
  custom?: CustomCaptionParams
): KineticTransform {
  const glowR = custom?.glowRadius ?? 0;

  switch (animation) {
    case "pop": {
      // Start from a small visible scale (0.3) and ease-out-back to full scale (1.0)
      // easeOutBack overshoots past 1.0 then settles, creating a satisfying "pop" bounce
      const bounceT = easeOutBack(t);
      const scale = 0.3 + bounceT * 0.7; // 0.3 → overshoot → 1.0
      return {
        scale,
        offsetY: 0,
        alpha: Math.min(1, t * 4),
        rotation: 0,
        letterSpacing: 1,
        glowRadius: glowR > 0 ? easeOutCubic(t) * glowR : 0,
        glowAlpha: glowR > 0 ? easeOutCubic(t) * 0.8 : 0,
      };
    }

    case "slide": {
      const eased = easeOutCubic(t);
      return {
        scale: 1,
        offsetY: (1 - eased) * (canvasHeight * 0.03),
        alpha: eased,
        rotation: 0,
        letterSpacing: 1 + (1 - eased) * 0.5,
        glowRadius: glowR > 0 ? eased * glowR : 0,
        glowAlpha: glowR > 0 ? eased * 0.8 : 0,
      };
    }

    case "flicker": {
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
        glowRadius: glow * (glowR > 0 ? glowR : 20),
        glowAlpha: glow * 0.8,
      };
    }

    case "typewriter": {
      const eased = easeOutQuad(t);
      return {
        scale: 1,
        offsetY: 0,
        alpha: eased,
        rotation: 0,
        letterSpacing: 1 + (1 - eased) * 0.2,
        glowRadius: glowR > 0 ? eased * glowR : 0,
        glowAlpha: glowR > 0 ? eased * 0.8 : 0,
      };
    }

    case "none":
      return {
        scale: 1, offsetY: 0, alpha: 1, rotation: 0, letterSpacing: 1,
        glowRadius: glowR, glowAlpha: glowR > 0 ? 0.8 : 0,
      };

    case "fade":
    default:
      return {
        scale: 1,
        offsetY: 0,
        alpha: easeOutCubic(t),
        rotation: 0,
        letterSpacing: 1,
        glowRadius: glowR > 0 ? easeOutCubic(t) * glowR : 0,
        glowAlpha: glowR > 0 ? easeOutCubic(t) * 0.8 : 0,
      };
  }
}

/**
 * Idle animations by animation type.
 */
function getIdleAnimationByType(animation: string, time: number, custom?: CustomCaptionParams): KineticTransform {
  const base: KineticTransform = {
    scale: 1,
    offsetY: 0,
    alpha: 1,
    rotation: 0,
    letterSpacing: 1,
    glowRadius: 0,
    glowAlpha: 0,
  };
  const glowR = custom?.glowRadius ?? 0;

  switch (animation) {
    case "flicker": {
      const pulse = 0.6 + Math.sin(time * 3) * 0.2;
      const r = glowR > 0 ? glowR : 15;
      return { ...base, glowRadius: r + Math.sin(time * 2) * (r / 3), glowAlpha: pulse };
    }

    case "pop":
      return { ...base, scale: 1 + Math.sin(time * 1.5) * 0.008, glowRadius: glowR, glowAlpha: glowR > 0 ? 0.6 : 0 };

    default:
      return glowR > 0 ? { ...base, glowRadius: glowR, glowAlpha: 0.6 + Math.sin(time * 2) * 0.15 } : base;
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
  fontSize: number,
  custom?: CustomCaptionParams,
  /** AI-decided vertical position (0-1 fraction of canvas height, default 0.89) */
  verticalPosition?: number,
  /** AI-decided shadow color (CSS color, default "rgba(0,0,0,0.7)") */
  shadowColor?: string,
  /** AI-decided shadow blur (pixels, default 8) */
  shadowBlur?: number
) {
  if (!text || transform.alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, transform.alpha));

  // Position: AI-controlled vertical position, centered horizontally
  const x = canvasWidth / 2;
  const y = canvasHeight * (verticalPosition ?? 0.89) + transform.offsetY;

  ctx.translate(x, y);
  ctx.scale(transform.scale, transform.scale);
  ctx.rotate((transform.rotation * Math.PI) / 180);

  // Font setup: custom params override named style defaults
  if (custom?.fontWeight || custom?.fontStyle || custom?.fontFamily) {
    const weight = custom.fontWeight ?? 700;
    const fStyle = custom.fontStyle === "italic" ? "italic " : "";
    const family = custom.fontFamily === "serif" ? "Georgia, serif"
      : custom.fontFamily === "mono" ? "'Courier New', monospace"
      : "-apple-system, sans-serif";
    ctx.font = `${fStyle}${weight} ${fontSize}px ${family}`;
  } else {
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
  }

  ctx.textAlign = "center";

  // Resolve text color (default white)
  const textColor = custom?.color ?? "white";

  // Resolve glow colors
  const glowColor1 = custom?.glowColor ?? "rgba(124, 58, 234, 1)";
  const glowColor2 = custom?.glowColor
    ? custom.glowColor  // Use same color for second layer with reduced alpha
    : "rgba(236, 72, 153, 1)";

  // Letter spacing (applied by drawing characters individually if needed)
  if (transform.letterSpacing !== 1 && Math.abs(transform.letterSpacing - 1) > 0.05) {
    drawSpacedText(ctx, text, 0, 0, transform.letterSpacing, transform, textColor, glowColor1, shadowColor ?? "rgba(0,0,0,0.7)", shadowBlur ?? 8);
  } else {
    // Glow effect
    if (transform.glowRadius > 0 && transform.glowAlpha > 0) {
      ctx.shadowColor = hexToRgba(glowColor1, transform.glowAlpha);
      ctx.shadowBlur = transform.glowRadius;
      ctx.fillStyle = textColor;
      ctx.fillText(text, 0, 0);

      // Second glow layer
      ctx.shadowColor = hexToRgba(glowColor2, transform.glowAlpha * 0.7);
      ctx.shadowBlur = transform.glowRadius * 1.5;
      ctx.fillText(text, 0, 0);

      ctx.shadowBlur = 0;
    }

    // Main text — AI controls shadow
    ctx.shadowColor = shadowColor ?? "rgba(0,0,0,0.7)";
    ctx.shadowBlur = shadowBlur ?? 8;
    ctx.fillStyle = textColor;
    ctx.fillText(text, 0, 0);
  }

  ctx.restore();
}

/** Convert a hex color or rgba string to rgba with specific alpha. */
function hexToRgba(color: string, alpha: number): string {
  // Already rgba/rgb format
  if (color.startsWith("rgba(") || color.startsWith("rgb(")) {
    const match = color.match(/[\d.]+/g);
    if (match && match.length >= 3) {
      return `rgba(${match[0]}, ${match[1]}, ${match[2]}, ${alpha})`;
    }
  }
  // Hex format
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return `rgba(255, 255, 255, ${alpha})`;
}

function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  transform: KineticTransform,
  textColor: string,
  glowColor: string,
  sColor: string = "rgba(0,0,0,0.7)",
  sBlur: number = 8
) {
  const chars = text.split("");
  const baseWidths = chars.map((c) => ctx.measureText(c).width);
  const totalWidth = baseWidths.reduce((sum, w) => sum + w * spacing, 0);
  let currentX = x - totalWidth / 2;

  ctx.fillStyle = textColor;

  // Glow pass first (if active)
  if (transform.glowRadius > 0 && transform.glowAlpha > 0) {
    ctx.shadowColor = hexToRgba(glowColor, transform.glowAlpha);
    ctx.shadowBlur = transform.glowRadius;
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], currentX + baseWidths[i] / 2, y);
      currentX += baseWidths[i] * spacing;
    }
    // Reset for shadow pass
    currentX = x - totalWidth / 2;
  }

  // Main text with shadow
  ctx.shadowColor = sColor;
  ctx.shadowBlur = sBlur;
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
