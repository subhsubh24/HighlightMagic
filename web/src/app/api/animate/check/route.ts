import { checkAnimationResult } from "@/lib/kling";

export const runtime = "nodejs";

/** Only allow alphanumeric, hyphens, and underscores in prediction IDs. */
const PREDICTION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * API route handler for checking photo animation status.
 * Companion to /api/animate/submit — avoids server action serialization.
 */
export async function POST(req: Request) {
  try {
    const { predictionId } = await req.json();

    if (!predictionId || typeof predictionId !== "string") {
      return Response.json({ error: "predictionId is required" }, { status: 400 });
    }

    // Sanitize predictionId to prevent path injection
    if (!PREDICTION_ID_PATTERN.test(predictionId)) {
      return Response.json({ error: "Invalid predictionId format" }, { status: 400 });
    }

    const result = await checkAnimationResult(predictionId);
    console.log(`[animate/check] predictionId=${predictionId} → status=${result.status}${result.videoUrl ? ` videoUrl=${result.videoUrl}` : ""}${result.error ? ` error=${result.error}` : ""}`);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[animate/check] Error:", message);
    return Response.json({ error: "Animation check failed" }, { status: 500 });
  }
}
