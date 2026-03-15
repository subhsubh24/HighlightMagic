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

/** AI-controllable kinetic text internals. All optional — defaults used when absent. */
export interface KineticTextParams {
  /** Pop entrance start scale (0.1-0.8). Default 0.3. */
  popStartScale?: number;
  /** Pop exit scale expansion (0.1-0.8). Default 0.3. */
  popExitScale?: number;
  /** Slide exit distance in pixels (5-40). Default 20. */
  slideExitDistance?: number;
  /** Fade exit vertical offset in pixels (-30 to 30). Default -10. */
  fadeExitOffset?: number;
  /** Flicker entrance speed multiplier (4-16). Default 8. */
  flickerSpeed?: number;
  /** Pop idle pulse frequency in Hz (0.5-4). Default 1.5. */
  popIdleFreq?: number;
  /** Flicker idle glow frequency in Hz (1-6). Default 3. */
  flickerIdleFreq?: number;
  /** Bold font size multiplier (0.8-1.6). Default 1.2. */
  boldSizeMultiplier?: number;
  /** Minimal font size multiplier (0.6-1.0). Default 0.9. */
  minimalSizeMultiplier?: number;
  /** Pop easeOutBack overshoot (1.0-3.0). Default 1.70158. Higher = bouncier. */
  popOvershoot?: number;
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

const DEFAULT_ENTRANCE_DURATION = 0.45; // seconds — slightly off-round for human feel
const DEFAULT_EXIT_DURATION = 0.28; // seconds

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
  animationIntensity: number = 1.0,
  idlePulse: number = 1.0,
  exitAnimation: string = "fade",
  kineticParams?: KineticTextParams
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
    const raw = getEntranceAnimationByType(animation, t, canvasHeight, custom, kineticParams);
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

  // Exit animation — varies by type
  const timeToEnd = clipDuration - localTime;
  if (timeToEnd < exitDuration && timeToEnd >= 0) {
    const t = timeToEnd / exitDuration; // 1 → 0 as clip ends
    switch (exitAnimation) {
      case "pop":
        return { ...base, alpha: t, scale: 1 + (1 - t) * (kineticParams?.popExitScale ?? 0.3), offsetY: 0 };
      case "slide":
        return { ...base, alpha: t, offsetY: (1 - t) * (kineticParams?.slideExitDistance ?? 20) };
      case "dissolve":
        return { ...base, alpha: t * t, offsetY: 0 }; // quadratic fade = smoother dissolve
      case "fade":
      default:
        return { ...base, alpha: t, offsetY: (1 - t) * (kineticParams?.fadeExitOffset ?? -10) };
    }
  }

  // Steady state — apply idle effects based on animation type
  return getIdleAnimationByType(animation, localTime, custom, idlePulse, kineticParams);
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
  custom?: CustomCaptionParams,
  kp?: KineticTextParams
): KineticTransform {
  const glowR = custom?.glowRadius ?? 0;

  switch (animation) {
    case "pop": {
      // Start from a small visible scale and ease-out-back to full scale (1.0)
      const startScale = kp?.popStartScale ?? 0.3;
      const bounceT = easeOutBack(t, kp?.popOvershoot);
      const scale = startScale + bounceT * (1 - startScale);
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
      const flickerPhase = t * (kp?.flickerSpeed ?? 8);
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
function getIdleAnimationByType(animation: string, time: number, custom?: CustomCaptionParams, idlePulse: number = 1.0, kp?: KineticTextParams): KineticTransform {
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
      const flickerIdleF = kp?.flickerIdleFreq ?? 3;
      const pulse = 0.6 + Math.sin(time * flickerIdleF) * 0.2 * idlePulse;
      const r = glowR > 0 ? glowR : 15;
      return { ...base, glowRadius: r + Math.sin(time * 2) * (r / 3) * idlePulse, glowAlpha: pulse };
    }

    case "pop": {
      const popIdleF = kp?.popIdleFreq ?? 1.5;
      return { ...base, scale: 1 + Math.sin(time * popIdleF) * 0.008 * idlePulse, glowRadius: glowR, glowAlpha: glowR > 0 ? 0.6 : 0 };
    }

    default:
      return glowR > 0 ? { ...base, glowRadius: glowR, glowAlpha: 0.6 + Math.sin(time * 2) * 0.15 * idlePulse } : base;
  }
}

/**
 * Word-wrap text to fit within maxWidth.
 * Returns an array of lines. If a single word exceeds maxWidth it stays on its own line
 * (the caller should shrink the font to handle that edge case).
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  if (words.length === 0) return [text];

  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + " " + words[i];
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }
  lines.push(currentLine);
  return lines;
}

/**
 * Draw a caption with kinetic transforms applied.
 * Long captions are word-wrapped to fit within the canvas with padding.
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
  shadowBlur?: number,
  /** AI-decided glow spread multiplier (default 1.5) */
  glowSpread?: number,
  /** AI-controllable kinetic text params */
  kineticParams?: KineticTextParams
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
        ctx.font = `900 ${fontSize * (kineticParams?.boldSizeMultiplier ?? 1.2)}px -apple-system, sans-serif`;
        break;
      case "Minimal":
        ctx.font = `300 ${fontSize * (kineticParams?.minimalSizeMultiplier ?? 0.9)}px -apple-system, sans-serif`;
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

  // ── Word-wrap: break long captions into multiple lines ──
  // Leave 10% padding on each side so text doesn't touch the edges.
  // Divide by scale so the max width is correct in the scaled coordinate space.
  const padding = canvasWidth * 0.1;
  const maxTextWidth = (canvasWidth - padding * 2) / Math.max(0.1, transform.scale);
  const lines = wrapText(ctx, text, maxTextWidth);
  const lineHeight = fontSize * 1.25;
  // Center the block vertically around the anchor point
  const blockOffset = -((lines.length - 1) * lineHeight) / 2;

  // Letter spacing (applied by drawing characters individually if needed)
  if (transform.letterSpacing !== 1 && Math.abs(transform.letterSpacing - 1) > 0.05) {
    for (let i = 0; i < lines.length; i++) {
      const ly = blockOffset + i * lineHeight;
      drawSpacedText(ctx, lines[i], 0, ly, transform.letterSpacing, transform, textColor, glowColor1, shadowColor ?? "rgba(0,0,0,0.7)", shadowBlur ?? 8);
    }
  } else {
    // Glow effect
    if (transform.glowRadius > 0 && transform.glowAlpha > 0) {
      ctx.fillStyle = textColor;
      ctx.shadowColor = hexToRgba(glowColor1, transform.glowAlpha);
      ctx.shadowBlur = transform.glowRadius;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], 0, blockOffset + i * lineHeight);
      }

      // Second glow layer
      ctx.shadowColor = hexToRgba(glowColor2, transform.glowAlpha * 0.7);
      ctx.shadowBlur = transform.glowRadius * (glowSpread ?? 1.5);
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], 0, blockOffset + i * lineHeight);
      }

      ctx.shadowBlur = 0;
    }

    // Main text — AI controls shadow
    ctx.shadowColor = shadowColor ?? "rgba(0,0,0,0.7)";
    ctx.shadowBlur = shadowBlur ?? 8;
    ctx.fillStyle = textColor;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 0, blockOffset + i * lineHeight);
    }
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

function easeOutBack(t: number, overshoot?: number): number {
  const c1 = overshoot ?? 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
