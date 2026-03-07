import { submitTextToVideo } from "@/lib/atlascloud";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Submit an AI outro card generation (Atlas Cloud Text-to-Video).
 * Returns a prediction ID for polling via /api/animate/check (same poll endpoint).
 */
export async function POST(req: Request) {
  try {
    const { prompt, duration } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }
    if (prompt.length > 1000) {
      return Response.json(
        { error: "prompt must be 1000 characters or fewer" },
        { status: 400 }
      );
    }

    const dur =
      typeof duration === "number" ? Math.max(2, Math.min(10, duration)) : 5;

    const predictionId = await submitTextToVideo(prompt, dur);
    return Response.json({ predictionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[outro] Error:", message);
    return Response.json(
      { error: "Outro card generation failed" },
      { status: 500 }
    );
  }
}
