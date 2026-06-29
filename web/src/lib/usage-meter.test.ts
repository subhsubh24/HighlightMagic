import { describe, it, expect, vi } from "vitest";
import { formatUsageLog, logProviderUsage } from "./usage-meter";

describe("formatUsageLog", () => {
  it("formats a basic usage line with the [CostMeter] tag", () => {
    const line = formatUsageLog({
      provider: "elevenlabs",
      op: "tts",
      units: 123,
      unit: "chars",
    });
    expect(line).toContain("[CostMeter]");
    expect(line).toContain("elevenlabs-tts");
    expect(line).toContain("chars=123");
    expect(line).toContain("billed per chars");
  });

  it("appends meta as key=value pairs", () => {
    const line = formatUsageLog({
      provider: "atlascloud",
      op: "kling",
      units: 1,
      unit: "job",
      meta: { model: "kling-v2.5-turbo-pro", duration: 5 },
    });
    expect(line).toContain("job=1");
    expect(line).toContain("model=kling-v2.5-turbo-pro");
    expect(line).toContain("duration=5");
  });

  it("coerces a non-finite unit count to 0 (never emits NaN/Infinity)", () => {
    expect(formatUsageLog({ provider: "p", op: "o", units: NaN, unit: "chars" })).toContain("chars=0");
    expect(formatUsageLog({ provider: "p", op: "o", units: Infinity, unit: "seconds" })).toContain("seconds=0");
  });
});

describe("logProviderUsage", () => {
  it("emits exactly one console.log line carrying the cost driver", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logProviderUsage({ provider: "elevenlabs", op: "sfx", units: 2, unit: "seconds" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("[CostMeter] elevenlabs-sfx: seconds=2");
    spy.mockRestore();
  });

  it("never throws even if console.log throws", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("log sink down");
    });
    expect(() =>
      logProviderUsage({ provider: "p", op: "o", units: 1, unit: "job" })
    ).not.toThrow();
    spy.mockRestore();
  });
});
