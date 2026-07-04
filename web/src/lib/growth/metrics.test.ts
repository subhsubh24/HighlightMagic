import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getGrowthMetrics } from "./metrics";
import { addPendingSignup, confirmSignup, _resetWaitlistMemory } from "./waitlist-store";
import { recordEvent, _resetExperimentMemory, EXPERIMENTS } from "./experiments";

describe("growth metrics (E6d)", () => {
  beforeEach(() => {
    _resetWaitlistMemory();
    _resetExperimentMemory();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports dry-run + awaiting_connect when nothing is wired", async () => {
    const m = await getGrowthMetrics();
    expect(m.source).toBe("dry-run");
    expect(m.awaiting_connect).toBe(true);
    expect(m.channels_connected).toEqual([]);
    expect(m.funnel.waitlist_signups).toBe(0);
    expect(m.funnel.confirm_rate).toBeNull();
    expect(m.email.connected).toBe(false);
    // E8: every registered experiment is reported with honest zeros pre-traffic.
    expect(m.experiments.length).toBe(Object.keys(EXPERIMENTS).length);
    expect(m.experiments[0].variants.every((v) => v.exposures === 0)).toBe(true);
    expect(m.experiments[0].lifts[0].verdict).toBe("insufficient_data");
  });

  it("surfaces E8 experiment aggregates pulled from the store", async () => {
    await recordEvent("landing-headline", "control", "exposure");
    await recordEvent("landing-headline", "control", "conversion");
    const m = await getGrowthMetrics();
    const exp = m.experiments.find((e) => e.id === "landing-headline")!;
    const control = exp.variants.find((v) => v.variant === "control")!;
    expect(control.exposures).toBe(1);
    expect(control.conversions).toBe(1);
  });

  it("never invents numbers — reflects real in-memory counts", async () => {
    await addPendingSignup("a@b.com");
    const t = await addPendingSignup("c@d.com");
    await confirmSignup(t);
    const m = await getGrowthMetrics();
    expect(m.funnel.waitlist_signups).toBe(2);
    expect(m.funnel.waitlist_confirmed).toBe(1);
    expect(m.funnel.confirm_rate).toBe(0.5);
  });

  it("marks email channel connected when provider env is present", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const m = await getGrowthMetrics();
    expect(m.channels_connected).toContain("email");
    expect(m.awaiting_connect).toBe(false);
    expect(m.email.provider).toBe("resend");
  });
});
