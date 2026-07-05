import { describe, it, expect } from "vitest";
import {
  decodeDataUriByteLength,
  checkTtsResult,
  checkVideoResult,
  resolveEvalCostCapUSD,
  costCeilingExceeded,
  DEFAULT_EVAL_MAX_USD,
  type TtsExpected,
  type VideoExpected,
} from "./eval-assertions";

// A tiny real base64 payload: "hello world" is 11 bytes decoded.
const HELLO_B64 = Buffer.from("hello world").toString("base64");
const HELLO_DATA_URI = `data:audio/mpeg;base64,${HELLO_B64}`;

describe("decodeDataUriByteLength", () => {
  it("returns the decoded byte length of a base64 data URI", () => {
    expect(decodeDataUriByteLength(HELLO_DATA_URI)).toBe(11);
  });

  it("returns 0 for non-data-URI strings", () => {
    expect(decodeDataUriByteLength("https://example.com/a.mp3")).toBe(0);
    expect(decodeDataUriByteLength("not a uri")).toBe(0);
  });

  it("returns 0 for undefined or an empty base64 body", () => {
    expect(decodeDataUriByteLength(undefined)).toBe(0);
    expect(decodeDataUriByteLength("data:audio/mpeg;base64,")).toBe(0);
  });

  it("handles a non-audio mime data URI by still counting bytes", () => {
    expect(decodeDataUriByteLength(`data:image/png;base64,${HELLO_B64}`)).toBe(11);
  });
});

describe("checkTtsResult", () => {
  const expected: TtsExpected = { minAudioBytes: 5, maxAudioBytes: 1000, minDurationSec: 0.5 };

  it("passes a well-formed completed result", () => {
    const problems = checkTtsResult(
      { status: "completed", audioUrl: HELLO_DATA_URI, duration: 1.2 },
      expected,
    );
    expect(problems).toEqual([]);
  });

  it("flags a failed status and stops inspecting audio", () => {
    const problems = checkTtsResult({ status: "failed", error: "boom" }, expected);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("failed");
    expect(problems[0]).toContain("boom");
  });

  it("flags a missing audioUrl", () => {
    const problems = checkTtsResult({ status: "completed", duration: 1 }, expected);
    expect(problems.some((p) => p.includes("audioUrl is missing"))).toBe(true);
  });

  it("flags an audioUrl that is not an audio data URI", () => {
    const problems = checkTtsResult(
      { status: "completed", audioUrl: "https://cdn/x.mp3", duration: 1 },
      expected,
    );
    expect(problems.some((p) => p.includes("not an audio data URI"))).toBe(true);
  });

  it("flags audio below the byte floor (truncated/empty)", () => {
    const tiny = `data:audio/mpeg;base64,${Buffer.from("hi").toString("base64")}`; // 2 bytes
    const problems = checkTtsResult({ status: "completed", audioUrl: tiny, duration: 1 }, expected);
    expect(problems.some((p) => p.includes("below the 5-byte floor"))).toBe(true);
  });

  it("flags audio above the byte ceiling (garbage)", () => {
    const big = `data:audio/mpeg;base64,${Buffer.from("x".repeat(2000)).toString("base64")}`;
    const problems = checkTtsResult({ status: "completed", audioUrl: big, duration: 1 }, expected);
    expect(problems.some((p) => p.includes("above the 1000-byte ceiling"))).toBe(true);
  });

  it("flags a non-finite or non-positive duration", () => {
    const p1 = checkTtsResult({ status: "completed", audioUrl: HELLO_DATA_URI, duration: 0 }, expected);
    expect(p1.some((p) => p.includes("not a finite positive number"))).toBe(true);
    const p2 = checkTtsResult(
      { status: "completed", audioUrl: HELLO_DATA_URI, duration: NaN },
      expected,
    );
    expect(p2.some((p) => p.includes("not a finite positive number"))).toBe(true);
  });

  it("flags a duration below the floor", () => {
    const problems = checkTtsResult(
      { status: "completed", audioUrl: HELLO_DATA_URI, duration: 0.1 },
      expected,
    );
    expect(problems.some((p) => p.includes("below the 0.5s floor"))).toBe(true);
  });
});

describe("checkVideoResult", () => {
  const expected: VideoExpected = { acceptableSchemes: ["https:"] };

  it("passes a completed result with a valid https URL", () => {
    const problems = checkVideoResult(
      { status: "completed", outputUrl: "https://cdn.atlas/out.mp4" },
      expected,
    );
    expect(problems).toEqual([]);
  });

  it("defaults to accepting http and https", () => {
    expect(
      checkVideoResult({ status: "completed", outputUrl: "http://cdn/out.mp4" }),
    ).toEqual([]);
  });

  it("flags a non-completed status", () => {
    const problems = checkVideoResult({ status: "processing" }, expected);
    expect(problems.some((p) => p.includes("processing"))).toBe(true);
  });

  it("flags a failed status with its error", () => {
    const problems = checkVideoResult({ status: "failed", error: "gpu oom" }, expected);
    expect(problems.some((p) => p.includes("gpu oom"))).toBe(true);
  });

  it("flags a missing outputUrl on a completed result", () => {
    const problems = checkVideoResult({ status: "completed" }, expected);
    expect(problems.some((p) => p.includes("outputUrl is missing"))).toBe(true);
  });

  it("flags an invalid outputUrl", () => {
    const problems = checkVideoResult(
      { status: "completed", outputUrl: "not-a-url" },
      expected,
    );
    expect(problems.some((p) => p.includes("not a valid URL"))).toBe(true);
  });

  it("flags a URL whose scheme is not accepted", () => {
    const problems = checkVideoResult(
      { status: "completed", outputUrl: "http://cdn/out.mp4" },
      expected, // only https accepted
    );
    expect(problems.some((p) => p.includes("is not one of"))).toBe(true);
  });
});

describe("resolveEvalCostCapUSD", () => {
  it("parses a valid numeric env value", () => {
    expect(resolveEvalCostCapUSD("2.5")).toBe(2.5);
    expect(resolveEvalCostCapUSD("0")).toBe(0);
  });

  it("falls back to the default when unset or blank", () => {
    expect(resolveEvalCostCapUSD(undefined)).toBe(DEFAULT_EVAL_MAX_USD);
    expect(resolveEvalCostCapUSD("")).toBe(DEFAULT_EVAL_MAX_USD);
    expect(resolveEvalCostCapUSD("   ")).toBe(DEFAULT_EVAL_MAX_USD);
  });

  it("falls back on non-numeric or negative values (never silently disables the cap)", () => {
    expect(resolveEvalCostCapUSD("abc")).toBe(DEFAULT_EVAL_MAX_USD);
    expect(resolveEvalCostCapUSD("-5")).toBe(DEFAULT_EVAL_MAX_USD);
    expect(resolveEvalCostCapUSD("NaN")).toBe(DEFAULT_EVAL_MAX_USD);
  });

  it("honours a custom fallback", () => {
    expect(resolveEvalCostCapUSD(undefined, 3)).toBe(3);
  });
});

describe("costCeilingExceeded", () => {
  it("returns null when projected cost is within the cap", () => {
    expect(costCeilingExceeded(0.5, 1)).toBeNull();
    expect(costCeilingExceeded(1, 1)).toBeNull(); // exactly at cap is allowed
    expect(costCeilingExceeded(0, 1)).toBeNull();
  });

  it("returns an abort message when projected cost exceeds the cap", () => {
    const msg = costCeilingExceeded(1.5, 1);
    expect(msg).not.toBeNull();
    expect(msg).toContain("$1.50");
    expect(msg).toContain("$1.00");
    expect(msg).toContain("aborting before any paid call");
  });

  it("treats a non-finite projection as over-cap (fail-safe)", () => {
    expect(costCeilingExceeded(Infinity, 1)).not.toBeNull();
    expect(costCeilingExceeded(NaN, 1)).not.toBeNull();
  });
});
