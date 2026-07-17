import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock @vercel/kv so the KV-backed ("connected") snapshot can be exercised without a real
// connection (mirrors waitlist-store.test.ts). Harmless to the in-memory suites below — they
// never set KV env, so getGrowthMetrics never reaches the KV import.
const mockKv = {
  scard: vi.fn<(key: string) => Promise<number>>(),
  hgetall: vi.fn<(key: string) => Promise<Record<string, number> | null>>(),
};
vi.mock("@vercel/kv", () => ({ kv: mockKv }));

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

  it("reports source=kv + the waitlist-store channel once KV is configured", async () => {
    // The storeLive branch (source "kv" + the "waitlist-store" channel) only fires with real KV
    // env; the in-memory suites above never exercise it. Stub the KV env + the durable reads so the
    // connected snapshot is proven end to end — a regression here would misreport connection state
    // to the Growth dashboard (channels_connected / awaiting_connect).
    vi.stubEnv("KV_REST_API_URL", "https://example.kv.vercel.app");
    vi.stubEnv("KV_REST_API_TOKEN", "tok_secret");
    mockKv.scard.mockImplementation(async (key: string) =>
      key === "waitlist:emails" ? 7 : 3
    );
    mockKv.hgetall.mockResolvedValue(null); // no experiment traffic yet → honest zeros

    const m = await getGrowthMetrics();
    expect(m.source).toBe("kv");
    expect(m.channels_connected).toContain("waitlist-store");
    expect(m.awaiting_connect).toBe(false);
    expect(m.funnel.waitlist_signups).toBe(7);
    expect(m.funnel.waitlist_confirmed).toBe(3);
  });
});
