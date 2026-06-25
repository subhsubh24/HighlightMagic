import { submitStyleTransfer } from "@/lib/atlascloud";
import { checkExportAllowed } from "@/lib/entitlement";

export const runtime = "nodejs";

/**
 * Submit a video-to-video style transfer task (Wan 2.6 V2V via Atlas Cloud).
 * Accepts the video as a base64 data URI + style prompt + strength.
 * Returns a prediction ID for polling via /api/animate/check.
 * P0: requires userId + enforces freemium quota server-side before any paid call.
 */
export async function POST(req: Request) {
  try {
    const { userId, signedTransaction, videoData, prompt, strength } = await req.json();

    if (!userId || typeof userId !== "string") {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }

    const decision = await checkExportAllowed({
      userId,
      signedTransaction: typeof signedTransaction === "string" ? signedTransaction : null,
    });
    if (!decision.allowed) {
      return Response.json(
        { error: decision.reason ?? "quota exceeded", remaining: 0, limit: decision.limit, upgrade: !decision.isPro },
        { status: 402 }
      );
    }

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
