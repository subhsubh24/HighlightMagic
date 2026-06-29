import { checkAnimationResult } from "@/lib/kling";
import { checkRateLimit, getClientIP, rateLimitResponse, POLL_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Only allow alphanumeric, hyphens, and underscores in prediction IDs. */
const PREDICTION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * API route handler for checking photo animation status.
 * Companion to /api/animate/submit — avoids server action serialization.
 */
export async function POST(req: Request) {
  try {
    // Track H: this status poll hits the AtlasCloud/Kling provider and is unauthenticated, so
    // throttle it (generously, per POLL_RATE_LIMIT) to bound job-ID enumeration + DoS amplification
    // without breaking legitimate ~5s polling of an in-flight job.
    const rl = checkRateLimit(`animate-check:${getClientIP(req)}`, POLL_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl);

    const { predictionId } = await req.json();

    if (!predictionId || typeof predictionId !== "string") {
      return Response.json({ error: "predictionId is required" }, { status: 400 });
    }

    // Sanitize predictionId to prevent path injection
    if (!PREDICTION_ID_PATTERN.test(predictionId)) {
      return Response.json({ error: "Invalid predictionId format" }, { status: 400 });
    }

    const result = await checkAnimationResult(predictionId);
    // Map outputUrl → videoUrl for backward compatibility with client code
    const clientResult = {
      status: result.status,
      videoUrl: result.outputUrl,
      error: result.error,
    };
    console.log(`[animate/check] predictionId=${predictionId} → status=${clientResult.status}${clientResult.videoUrl ? ` videoUrl=${clientResult.videoUrl.slice(0, 80)}...` : ""}${clientResult.error ? ` error=${clientResult.error}` : ""}`);
    return Response.json(clientResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[animate/check] Error:", message);
    return Response.json({ error: "Animation check failed" }, { status: 500 });
  }
}
