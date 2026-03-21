/**
 * Velocity / speed ramping system.
 *
 * Defines speed curves that control playback rate over the duration of a clip.
 * This is the dominant viral edit style of 2025-2026 — speed ramps to slow-mo
 * on beat hits, then snaps back to normal/fast speed.
 *
 * Speed curves are defined as keyframes: position (0-1) → speed (0.25-4.0).
 * Between keyframes, speed is interpolated with smooth easing.
 */

export type VelocityPreset = "normal" | "hero" | "bullet" | "ramp_in" | "ramp_out" | "montage";

export interface VelocityKeyframe {
  /** Position within the clip (0-1). */
  position: number;
  /** Playback speed at this position (0.25 = quarter speed, 4.0 = 4x). */
  speed: number;
}

/** Preset velocity curves — modeled after CapCut's most viral presets.
 * Values use slightly irregular numbers to avoid the "algorithm feel" of
 * perfectly round keyframes. When the AI falls back to a named preset
 * instead of authoring custom keyframes, the result still feels hand-tuned. */
export const VELOCITY_PRESETS: Record<VelocityPreset, VelocityKeyframe[]> = {
  /** No speed change. */
  normal: [
    { position: 0, speed: 1.0 },
    { position: 1, speed: 1.0 },
  ],

  /**
   * Hero — the signature viral edit curve.
   * Fast approach → dramatic slow-mo at the peak → fast recovery.
   */
  hero: [
    { position: 0.0, speed: 1.95 },
    { position: 0.22, speed: 2.45 },
    { position: 0.36, speed: 0.28 },  // slow-mo hit
    { position: 0.54, speed: 0.28 },  // hold slow-mo
    { position: 0.72, speed: 2.05 },
    { position: 1.0, speed: 1.45 },
  ],

  /**
   * Bullet — snap into slow-mo and hold.
   * Fast → instant slow → hold → fast out.
   */
  bullet: [
    { position: 0.0, speed: 2.85 },
    { position: 0.16, speed: 2.9 },
    { position: 0.26, speed: 0.23 },  // snap to slow
    { position: 0.64, speed: 0.23 },  // hold
    { position: 0.82, speed: 2.85 },
    { position: 1.0, speed: 1.95 },
  ],

  /**
   * Ramp In — build up speed (useful for approach/travel shots).
   */
  ramp_in: [
    { position: 0.0, speed: 0.48 },
    { position: 0.38, speed: 0.72 },
    { position: 0.68, speed: 1.55 },
    { position: 1.0, speed: 2.85 },
  ],

  /**
   * Ramp Out — dramatic slow-down (for impact moments).
   */
  ramp_out: [
    { position: 0.0, speed: 2.45 },
    { position: 0.32, speed: 1.95 },
    { position: 0.62, speed: 0.97 },
    { position: 1.0, speed: 0.28 },
  ],

  /**
   * Montage — pulse between fast and slow (for multi-beat montages).
   * Each pulse hits ~0.5x on the "beat" positions.
   */
  montage: [
    { position: 0.0, speed: 1.55 },
    { position: 0.14, speed: 0.38 },  // beat 1
    { position: 0.31, speed: 2.05 },
    { position: 0.44, speed: 0.42 },  // beat 2
    { position: 0.61, speed: 1.95 },
    { position: 0.76, speed: 0.37 },  // beat 3
    { position: 0.88, speed: 2.1 },
    { position: 1.0, speed: 1.03 },
  ],
};

/**
 * Get the interpolated speed at a given position from raw keyframes.
 * Uses smooth cubic interpolation between keyframes.
 */
export function getSpeedFromKeyframes(position: number, keyframes: VelocityKeyframe[]): number {
  if (!keyframes || keyframes.length === 0) return 1.0;
  if (keyframes.length === 1) return keyframes[0].speed;

  const p = Math.max(0, Math.min(1, position));

  // Find surrounding keyframes
  let lower = keyframes[0];
  let upper = keyframes[keyframes.length - 1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (p >= keyframes[i].position && p <= keyframes[i + 1].position) {
      lower = keyframes[i];
      upper = keyframes[i + 1];
      break;
    }
  }

  if (lower.position === upper.position) return lower.speed;

  // Smooth interpolation (ease-in-out cubic)
  const t = (p - lower.position) / (upper.position - lower.position);
  const smoothT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return lower.speed + (upper.speed - lower.speed) * smoothT;
}

/**
 * Get the interpolated speed at a given position within a clip.
 * Uses smooth cubic interpolation between keyframes.
 */
export function getSpeedAtPosition(position: number, preset: VelocityPreset): number {
  return getSpeedFromKeyframes(position, VELOCITY_PRESETS[preset]);
}

/**
 * Calculate the "real" elapsed time for a clip at a given playback position,
 * accounting for the speed curve. Used to map canvas time → source video time.
 *
 * We integrate the speed curve numerically:
 * realTime = integral from 0 to position of speed(t) dt
 *
 * Returns the source-media time offset from trimStart.
 */
export function getSourceTimeAtPosition(
  position: number,
  clipDuration: number,
  preset: VelocityPreset,
  steps: number = 100,
  customKeyframes?: VelocityKeyframe[]
): number {
  if (!customKeyframes && preset === "normal") return position * clipDuration;

  const p = Math.max(0, Math.min(1, position));
  const dt = p / steps;
  let sourceTime = 0;

  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt;
    const speed = customKeyframes
      ? getSpeedFromKeyframes(t, customKeyframes)
      : getSpeedAtPosition(t, preset);
    sourceTime += speed * dt * clipDuration;
  }

  return sourceTime;
}

/**
 * Get the effective duration of a clip after applying the speed curve.
 * A clip with slow-mo will have a longer real duration but the same source duration.
 *
 * effectiveDuration = sourceClipDuration / averageSpeed
 */
export function getEffectiveDuration(
  sourceDuration: number,
  preset: VelocityPreset,
  customKeyframes?: VelocityKeyframe[]
): number {
  const kf = customKeyframes ?? VELOCITY_PRESETS[preset];
  // Check if it's a flat 1x curve (no speed change)
  if (!customKeyframes && preset === "normal") return sourceDuration;
  if (kf.every((k) => Math.abs(k.speed - 1.0) < 0.01)) return sourceDuration;

  // Calculate average speed across the curve using midpoint sampling
  // to avoid systematic bias from missing the endpoint at position 1.0
  const steps = 100;
  let totalSpeed = 0;
  for (let i = 0; i < steps; i++) {
    totalSpeed += getSpeedFromKeyframes((i + 0.5) / steps, kf);
  }
  const avgSpeed = totalSpeed / steps;

  // Guard against zero/near-zero average speed (e.g. all keyframes at speed 0)
  if (avgSpeed < 0.01) {
    console.warn("[Velocity] Average speed near zero — returning source duration to avoid Infinity");
    return sourceDuration;
  }

  return sourceDuration / avgSpeed;
}

/** Labels for UI display. */
export const VELOCITY_LABELS: Record<VelocityPreset, { label: string; description: string }> = {
  normal: { label: "Normal", description: "Original speed" },
  hero: { label: "Hero", description: "Slow-mo on the peak moment" },
  bullet: { label: "Bullet", description: "Snap into dramatic slow-mo" },
  ramp_in: { label: "Speed Up", description: "Build momentum over the clip" },
  ramp_out: { label: "Slow Down", description: "Dramatic deceleration" },
  montage: { label: "Montage", description: "Pulse between fast and slow" },
};

export const ALL_VELOCITY_PRESETS: VelocityPreset[] = [
  "normal", "hero", "bullet", "ramp_in", "ramp_out", "montage",
];

/** Get the suggested velocity preset for a theme. */
export function getSuggestedVelocity(theme: string): VelocityPreset {
  const map: Record<string, VelocityPreset> = {
    sports: "hero",
    gaming: "bullet",
    party: "montage",
    fitness: "hero",
    travel: "ramp_out",
    cooking: "normal",
    pets: "normal",
    vlog: "normal",
    wedding: "ramp_out",
    cinematic: "ramp_out",
  };
  return map[theme] ?? "normal";
}
