import { submitStyleTransfer } from "@/lib/atlascloud";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Submit a style transfer task (Atlas Cloud video-to-video).
 * Accepts JSON: {videoUrl, stylePrompt, strength?}
 * Returns {predictionId} for polling via /api/animate/check.
 */
export async function POST(req: Request) {
  try {
    const { videoUrl, stylePrompt, strength } = await req.json();

    if (!videoUrl || typeof videoUrl !== "string") {
      return Response.json({ error: "videoUrl is required" }, { status: 400 });
    }
    if (!stylePrompt || typeof stylePrompt !== "string") {
      return Response.json({ error: "stylePrompt is required" }, { status: 400 });
    }

    const s = typeof strength === "number" ? Math.max(0.1, Math.min(1.0, strength)) : 0.5;
    const predictionId = await submitStyleTransfer(videoUrl, stylePrompt, s);
    return Response.json({ predictionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[style-transfer] Error:", message);
    return Response.json(
      { error: "Style transfer failed" },
      { status: 500 }
    );
  }
}
