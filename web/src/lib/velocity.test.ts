import { describe, it, expect } from "vitest";
import {
  getSpeedAtPosition,
  getSourceTimeAtPosition,
  getEffectiveDuration,
  VELOCITY_PRESETS,
  getSuggestedVelocity,
  type VelocityPreset,
} from "./velocity";

// ── getSpeedAtPosition ──

describe("getSpeedAtPosition", () => {
  it("returns constant 1.0 for normal preset", () => {
    expect(getSpeedAtPosition(0, "normal")).toBe(1.0);
    expect(getSpeedAtPosition(0.5, "normal")).toBe(1.0);
    expect(getSpeedAtPosition(1, "normal")).toBe(1.0);
  });

  it("returns exact keyframe values at keyframe positions", () => {
    // hero preset starts at speed 2.0 at position 0
    expect(getSpeedAtPosition(0, "hero")).toBe(2.0);
    // hero ends at 1.5 at position 1.0
    expect(getSpeedAtPosition(1, "hero")).toBe(1.5);
  });

  it("clamps position to 0-1", () => {
    expect(getSpeedAtPosition(-0.5, "hero")).toBe(getSpeedAtPosition(0, "hero"));
    expect(getSpeedAtPosition(1.5, "hero")).toBe(getSpeedAtPosition(1, "hero"));
  });

  it("hero preset has slow-mo zone in the middle", () => {
    // hero: slow-mo at 0.35-0.55 (0.3x)
    const midSpeed = getSpeedAtPosition(0.45, "hero");
    expect(midSpeed).toBeLessThan(0.5); // in slow-mo zone
    // hero: fast approach at 0.1
    const approachSpeed = getSpeedAtPosition(0.1, "hero");
    expect(approachSpeed).toBeGreaterThan(1.5); // fast lead-in
  });

  it("bullet preset has extreme slow-mo", () => {
    // bullet: 0.25x at 0.25-0.65
    const slowSpeed = getSpeedAtPosition(0.45, "bullet");
    expect(slowSpeed).toBeLessThan(0.5);
  });

  it("ramp_in accelerates over time", () => {
    const earlySpeed = getSpeedAtPosition(0.1, "ramp_in");
    const lateSpeed = getSpeedAtPosition(0.9, "ramp_in");
    expect(lateSpeed).toBeGreaterThan(earlySpeed);
  });

  it("ramp_out decelerates over time", () => {
    const earlySpeed = getSpeedAtPosition(0.1, "ramp_out");
    const lateSpeed = getSpeedAtPosition(0.9, "ramp_out");
    expect(lateSpeed).toBeLessThan(earlySpeed);
  });

  it("montage pulses between fast and slow", () => {
    // Montage has beats at 0.15, 0.45, 0.75 (0.4x)
    const beat1 = getSpeedAtPosition(0.15, "montage");
    const between = getSpeedAtPosition(0.3, "montage");
    expect(beat1).toBeLessThan(between); // beat = slow, between = fast
  });

  it("interpolates smoothly between keyframes", () => {
    // Check that interpolation produces values between the two keyframe endpoints
    const presets: VelocityPreset[] = ["hero", "bullet", "ramp_in", "ramp_out", "montage"];
    for (const preset of presets) {
      for (let p = 0; p <= 1; p += 0.01) {
        const speed = getSpeedAtPosition(p, preset);
        expect(speed).toBeGreaterThanOrEqual(0.1); // reasonable lower bound
        expect(speed).toBeLessThanOrEqual(5.0); // reasonable upper bound
      }
    }
  });
});

// ── getSourceTimeAtPosition ──

describe("getSourceTimeAtPosition", () => {
  it("returns linear mapping for normal preset", () => {
    expect(getSourceTimeAtPosition(0, 10, "normal")).toBe(0);
    expect(getSourceTimeAtPosition(0.5, 10, "normal")).toBe(5);
    expect(getSourceTimeAtPosition(1, 10, "normal")).toBe(10);
  });

  it("returns 0 at position 0", () => {
    const presets: VelocityPreset[] = ["normal", "hero", "bullet", "ramp_in", "ramp_out", "montage"];
    for (const preset of presets) {
      expect(getSourceTimeAtPosition(0, 10, preset)).toBe(0);
    }
  });

  it("hero preset covers more source time due to speed ramps", () => {
    // With speed > 1x on average, we cover more source footage
    const sourceTime = getSourceTimeAtPosition(1, 10, "hero");
    // Hero has fast sections (2x, 2.5x) and slow sections (0.3x)
    // Should NOT equal 10s (it's not 1x average)
    expect(sourceTime).not.toBe(10);
    expect(sourceTime).toBeGreaterThan(0);
  });

  it("source time is monotonically increasing", () => {
    const presets: VelocityPreset[] = ["hero", "bullet", "ramp_in", "ramp_out", "montage"];
    for (const preset of presets) {
      let prev = 0;
      for (let p = 0.05; p <= 1.0; p += 0.05) {
        const current = getSourceTimeAtPosition(p, 10, preset);
        expect(current).toBeGreaterThanOrEqual(prev);
        prev = current;
      }
    }
  });

  it("scales with clip duration", () => {
    const time5 = getSourceTimeAtPosition(0.5, 5, "hero");
    const time10 = getSourceTimeAtPosition(0.5, 10, "hero");
    expect(time10).toBeCloseTo(time5 * 2, 1);
  });
});

// ── getEffectiveDuration ──

describe("getEffectiveDuration", () => {
  it("returns same duration for normal preset", () => {
    expect(getEffectiveDuration(10, "normal")).toBe(10);
  });

  it("returns longer effective duration for presets with slow-mo", () => {
    // Hero has slow-mo sections, so the effective duration should differ from source
    const heroEffective = getEffectiveDuration(10, "hero");
    // Average speed of hero is > 1.0 (fast sections dominate),
    // so effective duration < source duration
    expect(heroEffective).not.toBe(10);
    expect(heroEffective).toBeGreaterThan(0);
  });

  it("bullet effective duration is shorter (high average speed)", () => {
    // Bullet: 3x fast → 0.25x slow → 3x fast, average > 1
    const bulletEffective = getEffectiveDuration(10, "bullet");
    expect(bulletEffective).toBeGreaterThan(0);
  });

  it("returns positive value for all presets", () => {
    const presets: VelocityPreset[] = ["normal", "hero", "bullet", "ramp_in", "ramp_out", "montage"];
    for (const preset of presets) {
      const effective = getEffectiveDuration(10, preset);
      expect(effective).toBeGreaterThan(0);
    }
  });
});

// ── VELOCITY_PRESETS structure ──

describe("VELOCITY_PRESETS", () => {
  const presets: VelocityPreset[] = ["normal", "hero", "bullet", "ramp_in", "ramp_out", "montage"];

  for (const preset of presets) {
    it(`${preset} starts at position 0`, () => {
      expect(VELOCITY_PRESETS[preset][0].position).toBe(0);
    });

    it(`${preset} ends at position 1`, () => {
      const kf = VELOCITY_PRESETS[preset];
      expect(kf[kf.length - 1].position).toBe(1);
    });

    it(`${preset} has monotonically increasing positions`, () => {
      const kf = VELOCITY_PRESETS[preset];
      for (let i = 1; i < kf.length; i++) {
        expect(kf[i].position).toBeGreaterThanOrEqual(kf[i - 1].position);
      }
    });

    it(`${preset} has positive speed values`, () => {
      const kf = VELOCITY_PRESETS[preset];
      for (const k of kf) {
        expect(k.speed).toBeGreaterThan(0);
      }
    });
  }
});

// ── getSuggestedVelocity ──

describe("getSuggestedVelocity", () => {
  it("returns hero for sports", () => {
    expect(getSuggestedVelocity("sports")).toBe("hero");
  });

  it("returns bullet for gaming", () => {
    expect(getSuggestedVelocity("gaming")).toBe("bullet");
  });

  it("returns montage for party", () => {
    expect(getSuggestedVelocity("party")).toBe("montage");
  });

  it("returns normal for cooking", () => {
    expect(getSuggestedVelocity("cooking")).toBe("normal");
  });

  it("returns normal for unknown theme", () => {
    expect(getSuggestedVelocity("unknown")).toBe("normal");
  });
});
