import { isolateInstrumental } from "@/lib/elevenlabs-stems";

import { checkRateLimit, getClientIP, PAID_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Separate music into stems (instrumental isolation).
 * Accepts JSON: {musicDataUri: "data:audio/mpeg;base64,..."}
 * Returns {instrumentalUrl} — the instrumental-only track for ducking under voiceover.
 */
/** Max data URI size: ~15MB base64 ≈ ~11MB audio, enough for a 5-min 192kbps track. */
const MAX_DATA_URI_LENGTH = 15 * 1024 * 1024;

export async function POST(req: Request) {
  // H1: per-IP rate limit — this route triggers a paid ElevenLabs call. Stem separation
  // is an export sub-step whose quota is enforced upstream at /api/score (the web caller
  // sends no userId), so this route has no per-call quota gate of its own; the per-IP
  // throttle is its primary abuse brake (Track H1).
  const rl = checkRateLimit(`stems:${getClientIP(req)}`, PAID_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const { musicDataUri } = await req.json();

    if (!musicDataUri || typeof musicDataUri !== "string") {
      return Response.json({ error: "musicDataUri is required" }, { status: 400 });
    }
    if (musicDataUri.length > MAX_DATA_URI_LENGTH) {
      return Response.json({ error: "musicDataUri exceeds maximum size" }, { status: 400 });
    }

    const result = await isolateInstrumental(musicDataUri);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stems] Error:", message);
    return Response.json(
      { status: "failed", error: "Stem separation failed" },
      { status: 500 }
    );
  }
}
