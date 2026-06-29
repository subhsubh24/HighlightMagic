/**
 * Provider usage metering for COGS observability.
 *
 * The Anthropic (LLM) calls already log a computed-USD `[CostMeter]` line
 * because token prices are known and cited (ai-models.ts MODEL_PRICES_USD_PER_MILLION).
 * The audio/video providers — ElevenLabs (TTS/SFX/music) and AtlasCloud (Kling
 * video, upscale, lipsync) — bill on usage units (characters, seconds, jobs)
 * whose per-unit price depends on the account plan. We deliberately do NOT
 * hardcode a USD rate for them (no invented prices — see docs/MODEL_COSTS.md and
 * docs/BUSINESS_CASE.md §3, which say to "verify per-export cost from Vercel logs
 * + invoices"). Instead we log the COST-DRIVER UNITS per call so per-export COGS
 * can be reconciled from the logs against the real ElevenLabs/AtlasCloud invoice.
 *
 * Same `[CostMeter]` tag as the LLM lines so a single `grep [CostMeter]` over the
 * Vercel function logs aggregates the full per-export cost picture.
 */

export interface ProviderUsage {
  /** Billing provider, e.g. "elevenlabs" | "atlascloud". */
  provider: string;
  /** Operation, e.g. "tts" | "sfx" | "music" | "kling" | "upscale". */
  op: string;
  /** The billed quantity (the cost driver). */
  units: number;
  /** Unit of the cost driver, e.g. "chars" | "seconds" | "job". */
  unit: string;
  /** Extra context (model id, voice, bytes, etc.) — logged as key=value pairs. */
  meta?: Record<string, string | number>;
}

/** Format a provider-usage cost line. Pure (testable); used by logProviderUsage. */
export function formatUsageLog(u: ProviderUsage): string {
  const safeUnits = Number.isFinite(u.units) ? u.units : 0;
  const metaStr = u.meta
    ? Object.entries(u.meta)
        .map(([k, v]) => ` ${k}=${v}`)
        .join("")
    : "";
  return `[CostMeter] ${u.provider}-${u.op}: ${u.unit}=${safeUnits}${metaStr} (billed per ${u.unit}; reconcile vs provider invoice)`;
}

/**
 * Log a provider usage line for COGS observability. Never throws — metering must
 * never break the generation path it is observing.
 */
export function logProviderUsage(u: ProviderUsage): void {
  try {
    console.log(formatUsageLog(u));
  } catch {
    /* metering is best-effort — never let a logging error break generation */
  }
}
