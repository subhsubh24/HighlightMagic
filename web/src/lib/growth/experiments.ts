/**
 * E8 — Experiment ENGINE (Growth Execution Engine).
 *
 * Deterministic, sticky A/B variant assignment + privacy-safe aggregate exposure/conversion
 * logging + a lift measurement with a two-proportion significance test and a minimum-sample
 * gate (never calls noise a win).
 *
 * The daily Growth Agent designs falsifiable hypotheses (docs/growth/ANALYSIS_PLAYBOOK.md);
 * THIS engine executes them — assigns each visitor a sticky variant, records aggregate
 * exposures/conversions, and reports whether a variant beat control with statistical
 * significance. Winners/losers land in GROWTH_STATUS.experiments[] (pulled via
 * /api/growth/stats -> getGrowthMetrics, E7 analytics surface).
 *
 * PRIVACY (Track H / GTM): only per-variant COUNTERS are stored — never a raw unit id,
 * email, or event row. Assignment is a pure hash of `${experimentId}:${unitId}`; the unit id
 * stays with the caller and never lands in the datastore.
 *
 * Cross-instance: Vercel-KV-backed aggregate counters (atomic HINCRBY), mirroring
 * waitlist-store / kv-quota-store — falls back to an in-memory store when KV is not
 * configured (local dev + tests). Dry-run keeps counts in-process only.
 */

import { createHash } from "crypto";

export interface ExperimentVariant {
  /** Stable variant key the renderer branches on (e.g. "control", "variant"). */
  key: string;
  /** Relative allocation weight (>0). Buckets are proportional to weight / sum(weights). */
  weight: number;
}

export interface Experiment {
  id: string;
  /** First entry is treated as the CONTROL for lift measurement. */
  variants: ExperimentVariant[];
}

/**
 * Declarative registry — the SERVER-SIDE source of truth for which experiments exist and how
 * traffic splits. The Growth Agent adds a hypothesis here; the surface (landing/app) renders
 * the assigned variant; results flow back through getExperimentResults(). An unregistered id
 * is rejected everywhere (assignment + recording), so a forged client payload cannot mint
 * arbitrary counters.
 */
export const EXPERIMENTS: Readonly<Record<string, Experiment>> = {
  // H1 (staged in GTM_SCORECARD, not yet run): landing hero headline copy A/B.
  // 50/50 split; control is the current headline. Wire the render + exposure call when the
  // site goes live with traffic (pre-launch there is nothing to measure).
  "landing-headline": {
    id: "landing-headline",
    variants: [
      { key: "control", weight: 1 },
      { key: "variant", weight: 1 },
    ],
  },
} as const;

/** Minimum exposures PER ARM before a lift verdict is trusted — below this = insufficient_data. */
export const MIN_SAMPLE_PER_ARM = 100;

/**
 * Map (experimentId, unitId) deterministically into [0, 1). Same inputs -> same point forever,
 * so a visitor is STICKY to their variant across requests/instances without storing anything.
 */
function hashToUnitInterval(experimentId: string, unitId: string): number {
  const digest = createHash("sha256").update(`${experimentId}:${unitId}`).digest();
  // First 6 bytes -> integer in [0, 2^48); divide to land in [0, 1).
  const int = digest.readUIntBE(0, 6);
  return int / 2 ** 48;
}

/**
 * Assign a sticky variant for a unit. Returns null for an unknown experiment or empty unit id
 * (caller should then render control / skip the experiment — never throw on the render path).
 */
export function assignVariant(experimentId: string, unitId: string): string | null {
  const exp = EXPERIMENTS[experimentId];
  if (!exp || typeof unitId !== "string" || unitId.length === 0) return null;
  const total = exp.variants.reduce((sum, v) => sum + v.weight, 0);
  if (total <= 0) return null;
  const point = hashToUnitInterval(experimentId, unitId) * total;
  let cumulative = 0;
  for (const v of exp.variants) {
    cumulative += v.weight;
    if (point < cumulative) return v.key;
  }
  // Float-edge fallback (point === total): last variant.
  return exp.variants[exp.variants.length - 1].key;
}

/** True iff `variant` is a declared variant of `experimentId`. Guards the recording surface. */
export function isValidVariant(experimentId: string, variant: string): boolean {
  const exp = EXPERIMENTS[experimentId];
  return !!exp && exp.variants.some((v) => v.key === variant);
}

// ── Aggregate counter store ─────────────────────────────────────────────────────────────
// Only counts, keyed by `${experimentId}:${variant}`. No raw unit ids, ever.

export type ExperimentEvent = "exposure" | "conversion";

const EXPOSURE_KEY = "exp:exposures";
const CONVERSION_KEY = "exp:conversions";

export function isExperimentStoreConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

// In-memory fallback (single-instance; resets on cold start / between tests).
const memExposures = new Map<string, number>();
const memConversions = new Map<string, number>();

/**
 * Record one aggregate event for a variant. Returns false (no write) for an unknown
 * experiment/variant or bad event kind — so a forged payload cannot create counters. Best-
 * effort by design: analytics logging must never block or crash the caller's real work.
 */
export async function recordEvent(
  experimentId: string,
  variant: string,
  kind: ExperimentEvent
): Promise<boolean> {
  if (!isValidVariant(experimentId, variant)) return false;
  if (kind !== "exposure" && kind !== "conversion") return false;
  const field = `${experimentId}:${variant}`;
  if (isExperimentStoreConfigured()) {
    const { kv } = await import("@vercel/kv");
    await kv.hincrby(kind === "exposure" ? EXPOSURE_KEY : CONVERSION_KEY, field, 1);
  } else {
    const store = kind === "exposure" ? memExposures : memConversions;
    store.set(field, (store.get(field) ?? 0) + 1);
  }
  return true;
}

// ── Lift measurement (two-proportion z-test) ────────────────────────────────────────────

export interface VariantStats {
  variant: string;
  exposures: number;
  conversions: number;
  /** conversions / exposures, or null when there are no exposures yet. */
  rate: number | null;
}

export type LiftVerdict =
  | "insufficient_data"
  | "no_significant_difference"
  | "treatment_wins"
  | "control_wins";

export interface LiftResult {
  control: VariantStats;
  treatment: VariantStats;
  /** treatment.rate - control.rate (percentage points, as a fraction), or null. */
  absolute_lift: number | null;
  /** (treatment.rate - control.rate) / control.rate, or null when control.rate is 0/null. */
  relative_lift: number | null;
  z: number | null;
  /** Two-tailed p-value, or null when the test can't run (insufficient data / zero variance). */
  p_value: number | null;
  /** True only when p < 0.05 AND both arms have >= MIN_SAMPLE_PER_ARM exposures. */
  significant: boolean;
  verdict: LiftVerdict;
}

export interface ExperimentResult {
  id: string;
  variants: VariantStats[];
  /** Lift of each non-control variant vs the control (variants[0]); [] for single-arm. */
  lifts: LiftResult[];
}

/** Standard normal CDF via an erf approximation (Abramowitz & Stegun 7.1.26). */
function normalCdf(x: number): number {
  const z = x / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  const erf = z >= 0 ? y : -y;
  return 0.5 * (1 + erf);
}

function toStats(variant: string, exposures: number, conversions: number): VariantStats {
  return {
    variant,
    exposures,
    conversions,
    rate: exposures > 0 ? conversions / exposures : null,
  };
}

/**
 * Two-proportion z-test of treatment vs control. Reports "insufficient_data" below the sample
 * gate and never claims significance on noise. Fail-safe: any degenerate input (no exposures,
 * zero pooled variance) returns a non-significant, well-formed result rather than NaN.
 */
export function computeLift(control: VariantStats, treatment: VariantStats): LiftResult {
  const base: Omit<LiftResult, "verdict" | "significant"> = {
    control,
    treatment,
    absolute_lift:
      control.rate !== null && treatment.rate !== null ? treatment.rate - control.rate : null,
    relative_lift:
      control.rate !== null && control.rate > 0 && treatment.rate !== null
        ? (treatment.rate - control.rate) / control.rate
        : null,
    z: null,
    p_value: null,
  };

  if (control.exposures < MIN_SAMPLE_PER_ARM || treatment.exposures < MIN_SAMPLE_PER_ARM) {
    return { ...base, significant: false, verdict: "insufficient_data" };
  }

  const nC = control.exposures;
  const nT = treatment.exposures;
  const pooled = (control.conversions + treatment.conversions) / (nC + nT);
  // Guard the full degenerate range, not just zero variance: exposure and conversion beacons
  // are reported independently, so a lost exposure or a duplicated conversion can push a
  // variant's conversions above its exposures -> pooled >= 1 -> sqrt of a negative -> NaN. Both
  // pooled <= 0 (no conversions) and pooled >= 1 (saturated/over-counted) carry no usable
  // variance; return a well-formed non-significant result rather than a NaN z/p that would
  // masquerade as insufficient_data and corrupt the E7 surface.
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nC + 1 / nT));
  if (pooled <= 0 || pooled >= 1 || !(se > 0)) {
    return { ...base, significant: false, verdict: "no_significant_difference" };
  }

  const rateC = control.conversions / nC;
  const rateT = treatment.conversions / nT;
  const z = (rateT - rateC) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const significant = pValue < 0.05;

  let verdict: LiftVerdict = "no_significant_difference";
  if (significant) verdict = rateT > rateC ? "treatment_wins" : "control_wins";

  return { ...base, z, p_value: pValue, significant, verdict };
}

async function readCounters(): Promise<{
  exposures: Map<string, number>;
  conversions: Map<string, number>;
}> {
  if (isExperimentStoreConfigured()) {
    const { kv } = await import("@vercel/kv");
    const [exp, conv] = await Promise.all([
      kv.hgetall<Record<string, number>>(EXPOSURE_KEY),
      kv.hgetall<Record<string, number>>(CONVERSION_KEY),
    ]);
    return {
      exposures: new Map(Object.entries(exp ?? {}).map(([k, v]) => [k, Number(v) || 0])),
      conversions: new Map(Object.entries(conv ?? {}).map(([k, v]) => [k, Number(v) || 0])),
    };
  }
  return { exposures: new Map(memExposures), conversions: new Map(memConversions) };
}

/**
 * Snapshot every registered experiment: per-variant counts/rates + the lift of each treatment
 * vs control. Pure read; honest by construction (0 for a variant with no exposures yet).
 */
export async function getExperimentResults(): Promise<ExperimentResult[]> {
  const { exposures, conversions } = await readCounters();
  return Object.values(EXPERIMENTS).map((exp) => {
    const variants = exp.variants.map((v) => {
      const field = `${exp.id}:${v.key}`;
      return toStats(v.key, exposures.get(field) ?? 0, conversions.get(field) ?? 0);
    });
    const control = variants[0];
    const lifts = variants.slice(1).map((treatment) => computeLift(control, treatment));
    return { id: exp.id, variants, lifts };
  });
}

/** Test-only: clear the in-memory fallback between cases. */
export function _resetExperimentMemory(): void {
  memExposures.clear();
  memConversions.clear();
}
