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

/** Preset velocity curves — modeled after CapCut's most viral presets. */
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
    { position: 0.0, speed: 2.0 },
    { position: 0.2, speed: 2.5 },
    { position: 0.35, speed: 0.3 },  // slow-mo hit
    { position: 0.55, speed: 0.3 },  // hold slow-mo
    { position: 0.7, speed: 2.0 },
    { position: 1.0, speed: 1.5 },
  ],

  /**
   * Bullet — snap into slow-mo and hold.
   * Fast → instant slow → hold → fast out.
   */
  bullet: [
    { position: 0.0, speed: 3.0 },
    { position: 0.15, speed: 3.0 },
    { position: 0.25, speed: 0.25 },  // snap to slow
    { position: 0.65, speed: 0.25 },  // hold
    { position: 0.8, speed: 3.0 },
    { position: 1.0, speed: 2.0 },
  ],

  /**
   * Ramp In — build up speed (useful for approach/travel shots).
   */
  ramp_in: [
    { position: 0.0, speed: 0.5 },
    { position: 0.4, speed: 0.7 },
    { position: 0.7, speed: 1.5 },
    { position: 1.0, speed: 3.0 },
  ],

  /**
   * Ramp Out — dramatic slow-down (for impact moments).
   */
  ramp_out: [
    { position: 0.0, speed: 2.5 },
    { position: 0.3, speed: 2.0 },
    { position: 0.6, speed: 1.0 },
    { position: 1.0, speed: 0.3 },
  ],

  /**
   * Montage — pulse between fast and slow (for multi-beat montages).
   * Each pulse hits ~0.5x on the "beat" positions.
   */
  montage: [
    { position: 0.0, speed: 1.5 },
    { position: 0.15, speed: 0.4 },  // beat 1
    { position: 0.3, speed: 2.0 },
    { position: 0.45, speed: 0.4 },  // beat 2
    { position: 0.6, speed: 2.0 },
    { position: 0.75, speed: 0.4 },  // beat 3
    { position: 0.9, speed: 2.0 },
    { position: 1.0, speed: 1.0 },
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
  steps: number = 100
): number {
  if (preset === "normal") return position * clipDuration;

  const p = Math.max(0, Math.min(1, position));
  const dt = p / steps;
  let sourceTime = 0;

  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt;
    const speed = getSpeedAtPosition(t, preset);
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

  // Calculate average speed across the curve
  const steps = 100;
  let totalSpeed = 0;
  for (let i = 0; i < steps; i++) {
    totalSpeed += getSpeedFromKeyframes(i / steps, kf);
  }
  const avgSpeed = totalSpeed / steps;

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
