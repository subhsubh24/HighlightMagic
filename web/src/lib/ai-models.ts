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
export const CLAUDE_PLANNER = "claude-opus-4-6";

/** Tape validation: cheap structured-output Haiku call. */
export const CLAUDE_VALIDATOR = "claude-haiku-4-5-20251001";

// ── ElevenLabs ──

/** Standard TTS: low-latency flash tier. */
export const ELEVENLABS_TTS = "eleven_flash_v2_5";

/** Voice-clone TTS: same low-latency tier as standard TTS. */
export const ELEVENLABS_VOICE_CLONE_MODEL = "eleven_flash_v2_5";
