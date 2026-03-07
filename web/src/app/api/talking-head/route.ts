import { submitLipSync } from "@/lib/atlascloud";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Submit a talking head generation (Atlas Cloud lip sync).
 * Accepts JSON: {imageData (base64), audioData (base64), duration?}
 * Returns {predictionId} for polling via /api/animate/check.
 */
export async function POST(req: Request) {
  try {
    const { imageData, audioData, duration } = await req.json();

    if (!imageData || typeof imageData !== "string") {
      return Response.json({ error: "imageData is required" }, { status: 400 });
    }
    if (!audioData || typeof audioData !== "string") {
      return Response.json({ error: "audioData is required" }, { status: 400 });
    }

    const dur = typeof duration === "number" ? Math.max(2, Math.min(10, duration)) : 5;
    const predictionId = await submitLipSync(imageData, audioData, dur);
    return Response.json({ predictionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[talking-head] Error:", message);
    return Response.json(
      { error: "Talking head generation failed" },
      { status: 500 }
    );
  }
}
