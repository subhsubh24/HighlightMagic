import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIP, PUBLIC_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { isValidVariant, recordEvent, type ExperimentEvent } from "@/lib/growth/experiments";

// E8 — Experiment exposure/conversion beacon.
// The surface (landing/app) POSTs which registered experiment+variant a visitor SAW
// (exposure) or CONVERTED on. Only aggregate COUNTERS are stored — never the unit id or any
// PII (see lib/growth/experiments.ts). This is analytics telemetry, not a paid path: it fires
// no external/LLM call and cannot drain spend.
//
// Track H: PUBLIC-form rate-limited (H1) and STRICTLY validated (H2) — an unregistered
// experiment/variant or bad event kind is rejected with 400 and mints no counter, so a forged
// payload can't create arbitrary keys. Best-effort: a store error still returns ok so a
// telemetry blip never surfaces to the visitor.

export const runtime = "nodejs";
// A single KV HINCRBY; keep a modest budget above the platform default so a slow KV write
// isn't killed mid-increment.
export const maxDuration = 10;

const VALID_EVENTS: readonly ExperimentEvent[] = ["exposure", "conversion"];

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  const rl = checkRateLimit(`experiment:${ip}`, PUBLIC_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { experimentId, variant, event } =
    (body as { experimentId?: unknown; variant?: unknown; event?: unknown }) ?? {};

  if (
    typeof experimentId !== "string" ||
    typeof variant !== "string" ||
    typeof event !== "string" ||
    !VALID_EVENTS.includes(event as ExperimentEvent) ||
    !isValidVariant(experimentId, variant)
  ) {
    return NextResponse.json({ error: "Unknown experiment, variant, or event." }, { status: 400 });
  }

  try {
    await recordEvent(experimentId, variant, event as ExperimentEvent);
  } catch {
    // Best-effort telemetry — never fail the visitor's request on a store blip.
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
