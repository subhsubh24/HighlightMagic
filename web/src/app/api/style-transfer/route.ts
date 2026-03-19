import { submitStyleTransfer } from "@/lib/atlascloud";

export const runtime = "nodejs";

/**
 * Submit a video-to-video style transfer task (Wan 2.6 V2V via Atlas Cloud).
 * Accepts the video as a base64 data URI + style prompt + strength.
 * Returns a prediction ID for polling via /api/animate/check.
 *
 * NOTE: For short highlight tapes (30-90s), base64-encoded video is typically
 * 5-30 MB — within practical limits for a JSON POST. Longer tapes may need
 * a multipart upload approach in the future.
 */
export async function POST(req: Request) {
  try {
    const { videoData, prompt, strength } = await req.json();

    if (!videoData || typeof videoData !== "string") {
      return Response.json({ error: "videoData is required (base64 data URI)" }, { status: 400 });
    }
    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }

    const safeStrength = typeof strength === "number"
      ? Math.max(0.1, Math.min(1.0, strength))
      : 0.5;

    // Strip data URI prefix if present (Atlas Cloud expects raw base64 or URL)
    const video = videoData.replace(/^data:video\/[^;]+;base64,/, "");

    const predictionId = await submitStyleTransfer(video, prompt, safeStrength);
    return Response.json({ predictionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[style-transfer] Error:", message);
    return Response.json(
      { error: "Style transfer submission failed" },
      { status: 500 }
    );
  }
}
