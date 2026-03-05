import { checkAnimationResult } from "@/lib/kling";

export const runtime = "nodejs";

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

    const result = await checkAnimationResult(predictionId);
    console.log(`[animate/check] predictionId=${predictionId} → status=${result.status}${result.videoUrl ? ` videoUrl=${result.videoUrl}` : ""}${result.error ? ` error=${result.error}` : ""}`);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
