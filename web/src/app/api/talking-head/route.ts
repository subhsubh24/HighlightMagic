import { submitLipSync } from "@/lib/atlascloud";
import { checkExportAllowed } from "@/lib/entitlement";
import { enforceGenerationCeiling } from "@/lib/spend-ceiling";

import { checkRateLimit, getClientIP, PAID_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { MAX_AUDIO_B64_CHARS, MAX_IMAGE_B64_CHARS, overStringLimit, tooLargeResponse } from "@/lib/input-bounds";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Submit a talking head generation (Atlas Cloud lip sync).
 * Accepts JSON: {userId, imageData (base64), audioData (base64), duration?}
 * Returns {predictionId} for polling via /api/animate/check.
 * P0: requires userId + enforces freemium quota server-side before any paid call.
 */
export async function POST(req: Request) {
  // H1: per-IP rate limit — this route triggers a paid API call, so throttle
  // request floods even before the quota gate (Track H1).
  const rl = checkRateLimit(`talking-head:${getClientIP(req)}`, PAID_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    // H2: reject an oversized body before buffering/parsing it (image + audio payloads).
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_B64_CHARS + MAX_AUDIO_B64_CHARS) {
      return tooLargeResponse();
    }

    const { userId, signedTransaction, imageData, audioData, duration } = await req.json();

    if (!userId || typeof userId !== "string") {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }
    // H2: bound the media payloads before anything else (don't even consume the quota gate
    // on an oversized request).
    if (overStringLimit(imageData, MAX_IMAGE_B64_CHARS) || overStringLimit(audioData, MAX_AUDIO_B64_CHARS)) {
      return tooLargeResponse();
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

    // H7: per-user daily generation ceiling — wallet-drain backstop independent of the
    // per-IP rate limit and the monthly export quota (this sub-call does not consume it).
    const genBlock = enforceGenerationCeiling(userId);
    if (genBlock) return genBlock;

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
