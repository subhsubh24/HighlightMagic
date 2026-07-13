import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit coverage for the guarded Margin meter singleton.
 *
 * `getMeter()` is called on the REAL paid export path (src/actions/detect.ts +
 * src/app/api/validate/route.ts) as `getMeter()?.recordCall(...)?.catch(() => {})`. Two
 * behaviours are load-bearing and previously had ZERO tests:
 *
 *   1. Fail-safe: if the `margin-meter` SDK cannot construct, `getMeter()` must return `null`
 *      — NEVER throw — so a telemetry hiccup can never 500 a user's export. If the try/catch at
 *      margin-meter-client.ts:91-107 were ever removed, a throwing constructor would propagate
 *      straight into the paid route; this suite fails loud if that happens.
 *   2. The per-call session/workflow tagging (:94-103) that the offline eval harness relies on,
 *      and which production leaves untouched (passthrough) — the exact property that keeps
 *      production emits byte-for-byte identical.
 *
 * Both branches read module-scoped state, so each scenario re-imports the module under a fresh
 * mock via `vi.resetModules()`.
 */

interface RecordCallArg {
  workflowId?: string;
  sessionId?: string;
  provider?: string;
  model?: string;
}
interface RecordOutcomeArg {
  workflowId?: string;
  passed?: boolean;
}

/** A fake MarginMeter that records the exact args it is handed, so we can assert the wrapping. */
function makeCapturingMeter() {
  const recordCall = vi.fn(async (input: RecordCallArg) => ({ ok: true as const, statusCode: 200 }));
  const recordOutcome = vi.fn(async (input: RecordOutcomeArg) => ({
    ok: true as const,
    statusCode: 200,
  }));
  const ctor = vi.fn();
  class FakeMarginMeter {
    recordCall = recordCall;
    recordOutcome = recordOutcome;
    constructor() {
      ctor();
    }
  }
  return { FakeMarginMeter, recordCall, recordOutcome, ctor };
}

/** Re-import margin-meter-client with `margin-meter` mocked to `MarginMeter`. */
async function loadClientWith(MarginMeter: unknown) {
  vi.resetModules();
  vi.doMock("margin-meter", () => ({ MarginMeter }));
  return import("./margin-meter-client");
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("margin-meter");
  vi.restoreAllMocks();
});

describe("getMeter() fail-safe", () => {
  it("returns null (never throws) when the SDK constructor throws", async () => {
    class ThrowingMarginMeter {
      constructor() {
        throw new Error("SDK boom");
      }
    }
    const mod = await loadClientWith(ThrowingMarginMeter);
    // The whole point: no throw escapes into the caller's paid path.
    expect(() => mod.getMeter()).not.toThrow();
    expect(mod.getMeter()).toBeNull();
  });

  it("caches the null result — a failed construction is not retried on every call", async () => {
    const ctor = vi.fn(() => {
      throw new Error("SDK boom");
    });
    class ThrowingMarginMeter {
      constructor() {
        ctor();
      }
    }
    const mod = await loadClientWith(ThrowingMarginMeter);
    mod.getMeter();
    mod.getMeter();
    mod.getMeter();
    expect(ctor).toHaveBeenCalledTimes(1);
  });
});

describe("getMeter() success + caching", () => {
  it("returns a Meter with recordCall/recordOutcome when the SDK constructs", async () => {
    const { FakeMarginMeter } = makeCapturingMeter();
    const mod = await loadClientWith(FakeMarginMeter);
    const meter = mod.getMeter();
    expect(meter).not.toBeNull();
    expect(typeof meter?.recordCall).toBe("function");
    expect(typeof meter?.recordOutcome).toBe("function");
  });

  it("caches the singleton — the SDK is constructed at most once", async () => {
    const { FakeMarginMeter, ctor } = makeCapturingMeter();
    const mod = await loadClientWith(FakeMarginMeter);
    const a = mod.getMeter();
    const b = mod.getMeter();
    expect(a).toBe(b);
    expect(ctor).toHaveBeenCalledTimes(1);
  });
});

describe("per-call tagging (production passthrough vs eval override)", () => {
  it("production leaves emits untouched — no sessionId/workflowId injected", async () => {
    const { FakeMarginMeter, recordCall, recordOutcome } = makeCapturingMeter();
    const mod = await loadClientWith(FakeMarginMeter);
    const meter = mod.getMeter()!;
    await meter.recordCall({ workflowId: "highlightmagic-tape", provider: "anthropic" } as never);
    await meter.recordOutcome({ workflowId: "highlightmagic-tape", passed: true } as never);
    const callArg = recordCall.mock.calls[0][0];
    expect(callArg.workflowId).toBe("highlightmagic-tape");
    expect(callArg.sessionId).toBeUndefined();
    const outcomeArg = recordOutcome.mock.calls[0][0];
    expect(outcomeArg.workflowId).toBe("highlightmagic-tape");
  });

  it("setMeterWorkflow overrides workflowId on BOTH recordCall and recordOutcome", async () => {
    const { FakeMarginMeter, recordCall, recordOutcome } = makeCapturingMeter();
    const mod = await loadClientWith(FakeMarginMeter);
    const meter = mod.getMeter()!;
    mod.setMeterWorkflow(mod.HM_OPERATION.scorer);
    await meter.recordCall({ workflowId: "highlightmagic-tape", provider: "anthropic" } as never);
    await meter.recordOutcome({ workflowId: "highlightmagic-tape", passed: true } as never);
    expect(recordCall.mock.calls[0][0].workflowId).toBe("highlightmagic-scorer");
    expect(recordOutcome.mock.calls[0][0].workflowId).toBe("highlightmagic-scorer");
  });

  it("setMeterSessionId stamps sessionId on recordCall (and clears with undefined)", async () => {
    const { FakeMarginMeter, recordCall } = makeCapturingMeter();
    const mod = await loadClientWith(FakeMarginMeter);
    const meter = mod.getMeter()!;

    mod.setMeterSessionId("eval:run-42");
    await meter.recordCall({ workflowId: "highlightmagic-tape" } as never);
    expect(recordCall.mock.calls[0][0].sessionId).toBe("eval:run-42");

    mod.setMeterSessionId(undefined);
    await meter.recordCall({ workflowId: "highlightmagic-tape" } as never);
    expect(recordCall.mock.calls[1][0].sessionId).toBeUndefined();
  });

  it("clearing the workflow override reverts to passthrough", async () => {
    const { FakeMarginMeter, recordCall } = makeCapturingMeter();
    const mod = await loadClientWith(FakeMarginMeter);
    const meter = mod.getMeter()!;

    mod.setMeterWorkflow(mod.HM_OPERATION.validator);
    await meter.recordCall({ workflowId: "highlightmagic-tape" } as never);
    expect(recordCall.mock.calls[0][0].workflowId).toBe("highlightmagic-validator");

    mod.setMeterWorkflow(undefined);
    await meter.recordCall({ workflowId: "highlightmagic-tape" } as never);
    expect(recordCall.mock.calls[1][0].workflowId).toBe("highlightmagic-tape");
  });
});

describe("HM_OPERATION supply-chain node ids", () => {
  it("exposes the three per-operation workflow ids", async () => {
    const mod = await loadClientWith(makeCapturingMeter().FakeMarginMeter);
    expect(mod.HM_OPERATION).toEqual({
      scorer: "highlightmagic-scorer",
      planner: "highlightmagic-planner",
      validator: "highlightmagic-validator",
    });
  });
});
