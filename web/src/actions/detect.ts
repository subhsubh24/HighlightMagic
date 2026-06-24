"use server";

import type { SourceFileInfo } from "@/lib/frame-batching";
import { getEffectiveDuration } from "@/lib/velocity";
import type { VelocityPreset } from "@/lib/velocity";
import { CLAUDE_FRAME_SCORER, CLAUDE_PLANNER, estimateCostUSD } from "@/lib/ai-models";

// ── Debug logging ──

const DEBUG = process.env.NODE_ENV === "development" || process.env.DEBUG_DETECT === "1";
/** Debug-only logger — gated behind NODE_ENV or DEBUG_DETECT flag to avoid production noise. */
function debugLog(...args: unknown[]) {
  if (DEBUG) console.log(...args);
}

// ── API helpers ──

/** Retry config for 429/529 responses */
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2000;
/** Cap Retry-After waits — staggered launches prevent most 429s now */
const MAX_RETRY_WAIT_MS = 15_000;