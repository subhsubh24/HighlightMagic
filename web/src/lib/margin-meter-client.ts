import { MarginMeter } from "margin-meter";

/**
 * Guarded singleton accessor for the Margin cost-per-outcome meter.
 *
 * Margin (github.com/subhsubh24/Margin.ai) is a neutral, cross-provider economic
 * control layer: it measures cost-per-OUTCOME for AI-agent spend. This wraps the
 * published, dependency-free `margin-meter` SDK so our server-side Claude call
 * sites can emit their token/latency economics (and each export's pass/fail
 * outcome) without ever affecting the request they measure.
 *
 * Design:
 *  - The SDK reads its own config (MARGIN_INGEST_URL / MARGIN_INGEST_KEY) from
 *    the environment INTERNALLY — this module deliberately does NOT read those
 *    vars, so it introduces no new `process.env.*` surface for the
 *    validation-manifest gate to police. No key → the SDK makes no network call
 *    (fail-safe), so telemetry is a pure no-op in every keyless environment
 *    (local, CI, PR previews).
 *  - Construction is wrapped in try/catch and the instance is cached; any error
 *    (or a missing SDK) yields `null` and callers simply skip metering.
 *  - Callers MUST fire-and-forget: `getMeter()?.recordCall({...})?.catch(() => {})`.
 *    Metering must never block, slow, or throw into a user-facing path.
 */
let meter: MarginMeter | null | undefined;

export function getMeter(): MarginMeter | null {
  if (meter !== undefined) return meter;
  try {
    meter = new MarginMeter();
  } catch {
    meter = null;
  }
  return meter;
}
