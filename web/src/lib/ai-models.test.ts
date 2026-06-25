import { describe, it, expect } from "vitest";
import {
  CLAUDE_FRAME_SCORER,
  CLAUDE_PLANNER,
  CLAUDE_VALIDATOR,
  ELEVENLABS_TTS,
  ELEVENLABS_VOICE_CLONE_MODEL,
  MODEL_PRICES_USD_PER_MILLION,
  estimateCostUSD,
} from "./ai-models";

describe("ai-models constants", () => {
  it("exports non-empty model ID strings", () => {
    expect(typeof CLAUDE_FRAME_SCORER).toBe("string");
    expect(CLAUDE_FRAME_SCORER.length).toBeGreaterThan(0);
    expect(typeof CLAUDE_PLANNER).toBe("string");
    expect(CLAUDE_PLANNER.length).toBeGreaterThan(0);
    expect(typeof CLAUDE_VALIDATOR).toBe("string");
    expect(CLAUDE_VALIDATOR.length).toBeGreaterThan(0);
    expect(typeof ELEVENLABS_TTS).toBe("string");
    expect(ELEVENLABS_TTS.length).toBeGreaterThan(0);
    expect(typeof ELEVENLABS_VOICE_CLONE_MODEL).toBe("string");
    expect(ELEVENLABS_VOICE_CLONE_MODEL.length).toBeGreaterThan(0);
  });

  it("frame scorer and validator use Haiku tier", () => {
    expect(CLAUDE_FRAME_SCORER).toContain("haiku");
    expect(CLAUDE_VALIDATOR).toContain("haiku");
  });

  it("planner uses Sonnet tier", () => {
    expect(CLAUDE_PLANNER).toContain("sonnet");
  });

  it("ElevenLabs TTS models use flash tier", () => {
    expect(ELEVENLABS_TTS).toContain("flash");
    expect(ELEVENLABS_VOICE_CLONE_MODEL).toContain("flash");
  });

  it("price table has entries for frame scorer and planner", () => {
    expect(MODEL_PRICES_USD_PER_MILLION[CLAUDE_FRAME_SCORER]).toBeDefined();
    expect(MODEL_PRICES_USD_PER_MILLION[CLAUDE_PLANNER]).toBeDefined();
  });

  it("price table has positive prices", () => {
    for (const [, prices] of Object.entries(MODEL_PRICES_USD_PER_MILLION)) {
      expect(prices.input).toBeGreaterThan(0);
      expect(prices.output).toBeGreaterThan(0);
    }
  });

  it("Haiku output price is higher than input price", () => {
    const haiku = MODEL_PRICES_USD_PER_MILLION[CLAUDE_FRAME_SCORER];
    expect(haiku.output).toBeGreaterThan(haiku.input);
  });

  it("Sonnet output price is higher than input price", () => {
    const sonnet = MODEL_PRICES_USD_PER_MILLION[CLAUDE_PLANNER];
    expect(sonnet.output).toBeGreaterThan(sonnet.input);
  });

  it("Sonnet input price is higher than Haiku input price", () => {
    const haiku = MODEL_PRICES_USD_PER_MILLION[CLAUDE_FRAME_SCORER];
    const sonnet = MODEL_PRICES_USD_PER_MILLION[CLAUDE_PLANNER];
    expect(sonnet.input).toBeGreaterThan(haiku.input);
  });
});

describe("estimateCostUSD", () => {
  it("returns 0 for unknown model", () => {
    expect(estimateCostUSD("unknown-model", 1000, 500)).toBe(0);
    expect(estimateCostUSD("", 1000, 500)).toBe(0);
  });

  it("returns 0 for 0 tokens on known model", () => {
    expect(estimateCostUSD(CLAUDE_PLANNER, 0, 0)).toBe(0);
  });

  it("calculates Haiku cost correctly", () => {
    // 1M input tokens at $0.80 + 1M output at $4.00 = $4.80
    const cost = estimateCostUSD(CLAUDE_FRAME_SCORER, 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(4.8, 6);
  });

  it("calculates Sonnet cost correctly", () => {
    // 1M input at $3.00 + 1M output at $15.00 = $18.00
    const cost = estimateCostUSD(CLAUDE_PLANNER, 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(18.0, 6);
  });

  it("scales linearly with token counts", () => {
    const base = estimateCostUSD(CLAUDE_PLANNER, 1_000, 500);
    const double = estimateCostUSD(CLAUDE_PLANNER, 2_000, 1_000);
    expect(double).toBeCloseTo(base * 2, 10);
  });

  it("input and output tokens contribute independently", () => {
    const inputOnly = estimateCostUSD(CLAUDE_PLANNER, 1_000_000, 0);
    const outputOnly = estimateCostUSD(CLAUDE_PLANNER, 0, 1_000_000);
    const combined = estimateCostUSD(CLAUDE_PLANNER, 1_000_000, 1_000_000);
    expect(combined).toBeCloseTo(inputOnly + outputOnly, 10);
  });

  it("typical scoring call (200 input, 50 output) costs under $0.001", () => {
    const cost = estimateCostUSD(CLAUDE_FRAME_SCORER, 200, 50);
    expect(cost).toBeLessThan(0.001);
  });

  it("typical planner call (2000 input, 800 output) costs under $0.02", () => {
    const cost = estimateCostUSD(CLAUDE_PLANNER, 2_000, 800);
    expect(cost).toBeLessThan(0.02);
  });
});
