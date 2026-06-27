import { describe, expect, it } from "vitest";
import {
  anyFrameOverLimit,
  MAX_FRAME_B64_CHARS,
  MAX_PROMPT_CHARS,
  overStringLimit,
  tooLargeResponse,
} from "./input-bounds";

describe("overStringLimit", () => {
  it("flags a string longer than the limit", () => {
    expect(overStringLimit("x".repeat(MAX_PROMPT_CHARS + 1), MAX_PROMPT_CHARS)).toBe(true);
  });
  it("passes a string at or under the limit", () => {
    expect(overStringLimit("x".repeat(MAX_PROMPT_CHARS), MAX_PROMPT_CHARS)).toBe(false);
    expect(overStringLimit("hello", MAX_PROMPT_CHARS)).toBe(false);
  });
  it("passes absent / non-string values (required-ness is handled elsewhere)", () => {
    expect(overStringLimit(undefined, MAX_PROMPT_CHARS)).toBe(false);
    expect(overStringLimit(null, MAX_PROMPT_CHARS)).toBe(false);
    expect(overStringLimit(123, MAX_PROMPT_CHARS)).toBe(false);
  });
});

describe("anyFrameOverLimit", () => {
  it("flags when any frame's key exceeds the limit", () => {
    const frames = [
      { jpegBase64: "small" },
      { jpegBase64: "x".repeat(MAX_FRAME_B64_CHARS + 1) },
    ];
    expect(anyFrameOverLimit(frames, "jpegBase64", MAX_FRAME_B64_CHARS)).toBe(true);
  });
  it("passes when every frame is within the limit", () => {
    const frames = [{ jpegBase64: "a" }, { jpegBase64: "b" }];
    expect(anyFrameOverLimit(frames, "jpegBase64", MAX_FRAME_B64_CHARS)).toBe(false);
  });
  it("tolerates non-array / malformed entries", () => {
    expect(anyFrameOverLimit(undefined, "jpegBase64", MAX_FRAME_B64_CHARS)).toBe(false);
    expect(anyFrameOverLimit([null, 5, "x"], "jpegBase64", MAX_FRAME_B64_CHARS)).toBe(false);
  });
});

describe("tooLargeResponse", () => {
  it("returns a generic 413 with no field names leaked", async () => {
    const res = tooLargeResponse();
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toEqual({ error: "Request payload too large" });
  });
});
