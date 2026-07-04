import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  EXPERIMENTS,
  MIN_SAMPLE_PER_ARM,
  assignVariant,
  isValidVariant,
  recordEvent,
  computeLift,
  getExperimentResults,
  _resetExperimentMemory,
  type VariantStats,
} from "./experiments";

const EXP = "landing-headline";

function stats(variant: string, exposures: number, conversions: number): VariantStats {
  return { variant, exposures, conversions, rate: exposures > 0 ? conversions / exposures : null };
}

describe("E8 experiment engine — assignment", () => {
  it("is deterministic and sticky: same (experiment, unit) always yields the same variant", () => {
    for (const unit of ["u1", "abc-123", "🎬", "another-visitor"]) {
      const first = assignVariant(EXP, unit);
      expect(first).not.toBeNull();
      for (let i = 0; i < 5; i++) expect(assignVariant(EXP, unit)).toBe(first);
    }
  });

  it("only ever returns a declared variant key", () => {
    const keys = EXPERIMENTS[EXP].variants.map((v) => v.key);
    for (let i = 0; i < 200; i++) {
      expect(keys).toContain(assignVariant(EXP, `unit-${i}`));
    }
  });

  it("splits traffic roughly by weight (50/50 within tolerance over many units)", () => {
    let control = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      if (assignVariant(EXP, `visitor-${i}`) === "control") control++;
    }
    const share = control / N;
    // Deterministic hash over distinct ids: expect ~0.5, allow a generous band.
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.55);
  });

  it("returns null for an unknown experiment or empty unit id", () => {
    expect(assignVariant("does-not-exist", "u1")).toBeNull();
    expect(assignVariant(EXP, "")).toBeNull();
    // @ts-expect-error runtime guard against a non-string unit id
    expect(assignVariant(EXP, undefined)).toBeNull();
  });
});

describe("E8 experiment engine — variant validation", () => {
  it("accepts declared variants and rejects everything else", () => {
    expect(isValidVariant(EXP, "control")).toBe(true);
    expect(isValidVariant(EXP, "variant")).toBe(true);
    expect(isValidVariant(EXP, "forged")).toBe(false);
    expect(isValidVariant("nope", "control")).toBe(false);
  });
});

describe("E8 experiment engine — recording (in-memory fallback)", () => {
  beforeEach(() => {
    _resetExperimentMemory();
    vi.unstubAllEnvs();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("counts exposures and conversions per variant, and reflects them in results", async () => {
    expect(await recordEvent(EXP, "control", "exposure")).toBe(true);
    expect(await recordEvent(EXP, "control", "exposure")).toBe(true);
    expect(await recordEvent(EXP, "control", "conversion")).toBe(true);
    expect(await recordEvent(EXP, "variant", "exposure")).toBe(true);

    const [result] = await getExperimentResults();
    const control = result.variants.find((v) => v.variant === "control")!;
    const variant = result.variants.find((v) => v.variant === "variant")!;
    expect(control.exposures).toBe(2);
    expect(control.conversions).toBe(1);
    expect(control.rate).toBe(0.5);
    expect(variant.exposures).toBe(1);
    expect(variant.conversions).toBe(0);
    expect(variant.rate).toBe(0);
  });

  it("refuses to record for a forged experiment/variant or a bad event kind (no counter minted)", async () => {
    expect(await recordEvent("forged-exp", "control", "exposure")).toBe(false);
    expect(await recordEvent(EXP, "forged-variant", "exposure")).toBe(false);
    // @ts-expect-error guard against a bad event kind at runtime
    expect(await recordEvent(EXP, "control", "click")).toBe(false);

    const [result] = await getExperimentResults();
    for (const v of result.variants) {
      expect(v.exposures).toBe(0);
      expect(v.conversions).toBe(0);
    }
  });

  it("reports zeros honestly before any event", async () => {
    const [result] = await getExperimentResults();
    expect(result.id).toBe(EXP);
    for (const v of result.variants) {
      expect(v.exposures).toBe(0);
      expect(v.rate).toBeNull();
    }
    expect(result.lifts[0].verdict).toBe("insufficient_data");
  });
});

describe("E8 experiment engine — lift measurement", () => {
  it("returns insufficient_data below the per-arm sample gate", () => {
    const lift = computeLift(stats("control", 50, 5), stats("variant", 50, 10));
    expect(lift.verdict).toBe("insufficient_data");
    expect(lift.significant).toBe(false);
    expect(lift.p_value).toBeNull();
    // absolute lift is still reported for context.
    expect(lift.absolute_lift).toBeCloseTo(0.1, 5);
  });

  it("declares a treatment winner on a clearly significant lift", () => {
    // control 10% (100/1000) vs treatment 20% (200/1000) — huge z, p ~ 0.
    const lift = computeLift(stats("control", 1000, 100), stats("variant", 1000, 200));
    expect(lift.verdict).toBe("treatment_wins");
    expect(lift.significant).toBe(true);
    expect(lift.p_value!).toBeLessThan(0.05);
    expect(lift.relative_lift).toBeCloseTo(1.0, 5); // doubled
  });

  it("declares control the winner when treatment is significantly worse", () => {
    const lift = computeLift(stats("control", 1000, 200), stats("variant", 1000, 100));
    expect(lift.verdict).toBe("control_wins");
    expect(lift.significant).toBe(true);
  });

  it("calls a tiny difference NOT significant (never noise-as-win)", () => {
    // 10.0% vs 10.5% over 1000 each — well within noise.
    const lift = computeLift(stats("control", 1000, 100), stats("variant", 1000, 105));
    expect(lift.verdict).toBe("no_significant_difference");
    expect(lift.significant).toBe(false);
    expect(lift.p_value!).toBeGreaterThan(0.05);
  });

  it("handles zero-variance arms (both 0 conversions) without NaN", () => {
    const lift = computeLift(stats("control", 200, 0), stats("variant", 200, 0));
    expect(lift.verdict).toBe("no_significant_difference");
    expect(lift.significant).toBe(false);
    expect(Number.isNaN(lift.z ?? 0)).toBe(false);
  });

  it("never emits NaN when conversions exceed exposures (lost/duplicated beacon, pooled > 1)", () => {
    // A lost exposure or a double-fired conversion can make conversions > exposures. The pooled
    // proportion then exceeds 1 -> sqrt of a negative. The result must stay well-formed.
    const lift = computeLift(stats("control", 100, 1000), stats("variant", 100, 50));
    expect(lift.verdict).toBe("no_significant_difference");
    expect(lift.significant).toBe(false);
    expect(lift.z).toBeNull();
    expect(lift.p_value).toBeNull();
  });

  it("handles fully-saturated arms (every exposure converted, pooled === 1) without NaN", () => {
    const lift = computeLift(stats("control", 200, 200), stats("variant", 200, 200));
    expect(lift.verdict).toBe("no_significant_difference");
    expect(lift.significant).toBe(false);
    expect(Number.isNaN(lift.z ?? 0)).toBe(false);
  });

  it("MIN_SAMPLE_PER_ARM guards both arms independently", () => {
    expect(computeLift(stats("c", MIN_SAMPLE_PER_ARM - 1, 10), stats("v", 1000, 100)).verdict).toBe(
      "insufficient_data"
    );
    expect(computeLift(stats("c", 1000, 100), stats("v", MIN_SAMPLE_PER_ARM - 1, 10)).verdict).toBe(
      "insufficient_data"
    );
  });
});

describe("E8 experiment engine — KV-backed store", () => {
  const hincrby = vi.fn();
  const hgetall = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    hincrby.mockReset();
    hgetall.mockReset();
    vi.stubEnv("KV_REST_API_URL", "https://example.kv.vercel-storage.com");
    vi.stubEnv("KV_REST_API_TOKEN", "tok");
    vi.doMock("@vercel/kv", () => ({ kv: { hincrby, hgetall } }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@vercel/kv");
    vi.resetModules();
  });

  it("writes atomic HINCRBY to the right hash/field when KV is configured", async () => {
    const mod = await import("./experiments");
    hincrby.mockResolvedValue(1);
    await mod.recordEvent(EXP, "variant", "exposure");
    await mod.recordEvent(EXP, "variant", "conversion");
    expect(hincrby).toHaveBeenCalledWith("exp:exposures", `${EXP}:variant`, 1);
    expect(hincrby).toHaveBeenCalledWith("exp:conversions", `${EXP}:variant`, 1);
  });

  it("reads counters from KV hashes and coerces string counts to numbers", async () => {
    const mod = await import("./experiments");
    hgetall.mockImplementation(async (key: string) =>
      key === "exp:exposures"
        ? { [`${EXP}:control`]: "1000", [`${EXP}:variant`]: "1000" }
        : { [`${EXP}:control`]: "100", [`${EXP}:variant`]: "200" }
    );
    const [result] = await mod.getExperimentResults();
    const control = result.variants.find((v) => v.variant === "control")!;
    expect(control.exposures).toBe(1000);
    expect(control.conversions).toBe(100);
    expect(result.lifts[0].verdict).toBe("treatment_wins");
  });
});
