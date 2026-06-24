/**
 * Single model map for all AI provider model IDs used by this backend.
 *
 * Swap a model by changing its value here — one line, one place.
 * Record every switch in docs/MODEL_COSTS.md (date, task, from→to, quality result, cost delta).
 *
 * AtlasCloud model IDs live in lib/atlascloud.ts (MODELS export) and are managed there.
 */

// ── Anthropic ──

/** Frame scoring: cheapest capable vision tier. */
export const CLAUDE_FRAME_SCORER = "claude-haiku-4-5-20251001";

/** Tape planning: uses extended thinking — needs a stronger reasoning model. */
export const CLAUDE_PLANNER = "claude-opus-4-8";

/** Tape validation: cheap structured-output Haiku call. */
export const CLAUDE_VALIDATOR = "claude-haiku-4-5-20251001";

// ── ElevenLabs ──

/** Standard TTS: low-latency flash tier. */
export const ELEVENLABS_TTS = "eleven_flash_v2_5";

/** Voice-clone TTS: same low-latency tier as standard TTS. */
export const ELEVENLABS_VOICE_CLONE_MODEL = "eleven_flash_v2_5";

// ── Cost metering ──

/**
 * Per-million-token USD prices (estimates — verify against console.anthropic.com).
 * Update this map whenever a model is swapped and record the change in docs/MODEL_COSTS.md.
 */
export const MODEL_PRICES_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  [CLAUDE_FRAME_SCORER]: { input: 0.80, output: 4.00 },
  [CLAUDE_PLANNER]: { input: 15.0, output: 75.0 },
  [CLAUDE_VALIDATOR]: { input: 0.80, output: 4.00 },
};

/** Returns the estimated USD cost for a single API call, or 0 if the model is unknown. */
export function estimateCostUSD(model: string, inputTokens: number, outputTokens: number): number {
  const prices = MODEL_PRICES_USD_PER_MILLION[model];
  if (!prices) return 0;
  return (inputTokens / 1_000_000) * prices.input + (outputTokens / 1_000_000) * prices.output;
}
