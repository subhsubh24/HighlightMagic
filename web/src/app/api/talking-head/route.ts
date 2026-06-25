import { submitLipSync } from "@/lib/atlascloud";
import { checkExportAllowed } from "@/lib/entitlement";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Submit a talking head generation (Atlas Cloud lip sync).
 * Accepts JSON: {userId, imageData (base64), audioData (base64), duration?}
 * Returns {predictionId} for polling via /api/animate/check.
 * P0: requires userId + enforces freemium quota server-side before any paid call.
 */
export async function POST(req: Request) {
  try {
    const { userId, signedTransaction, imageData, audioData, duration } = await req.json();

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

    if (!imageData || typeof imageData !== "string") {
      return Response.json({ error: "imageData is required" }, { status: 400 });
    }
    if (!audioData || typeof audioData !== "string") {
      return Response.json({ error: "audioData is required" }, { status: 400 });
    }

    const dur = typeof duration === "number" && Number.isFinite(duration) ? Math.max(2, Math.min(10, duration)) : 5;
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
