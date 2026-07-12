import { MarginMeter } from "margin-meter";
import type { RecordCallInput, RecordOutcomeInput, IngestResult } from "margin-meter";

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
 *  - Callers MUST `await` the emit with a swallowing catch:
 *    `await getMeter()?.recordCall({...})?.catch(() => {})`. Awaiting is required
 *    on Vercel serverless — the function instance freezes the moment a response
 *    is sent, so a bare floating promise is dropped before its fetch completes.
 *    The `.catch(() => {})` keeps it fail-safe (metering must never throw into a
 *    user-facing path), and with no ingest key the SDK makes no network call, so
 *    the await is instant in every keyless environment.
 *
 * SESSION TAGGING (`setMeterSessionId`): the app request path (scorer / planner /
 * validator) is NEVER touched by this — in production the session id is `undefined`
 * and every emit is byte-for-byte what it was before. It exists ONLY so the offline
 * Margin eval harness (web/src/evals/margin/) can stamp `sessionId="eval:<runid>"`
 * on the calls it drives through the real metered path, so Margin can compute the
 * eval batch's cost-per-outcome distribution as a distinct group. The value is read
 * per-emit (not at construction) from a module variable — no `process.env` read, so
 * the validation-manifest gate is unaffected.
 */

/** The two-method surface the app call sites use (a subset of `MarginMeter`). */
export interface Meter {
  recordCall(input: RecordCallInput): Promise<IngestResult>;
  recordOutcome(input: RecordOutcomeInput): Promise<IngestResult>;
}

let meter: Meter | null | undefined;
let sessionId: string | undefined;

/**
 * Set (or clear) the session id stamped on every subsequent `recordCall`. Called
 * ONLY by the offline eval harness; production never calls it, so emits are
 * unchanged. Pass `undefined` to clear.
 */
export function setMeterSessionId(id: string | undefined): void {
  sessionId = id;
}

export function getMeter(): Meter | null {
  if (meter !== undefined) return meter;
  try {
    const base = new MarginMeter();
    meter = {
      // Session id is read here, per-call, so it reflects the current value even if
      // the singleton was constructed earlier. Production leaves it undefined.
      recordCall: (input) => base.recordCall(sessionId ? { ...input, sessionId } : input),
      recordOutcome: (input) => base.recordOutcome(input),
    };
  } catch {
    meter = null;
  }
  return meter;
}
