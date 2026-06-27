import { submitPhotoAnimation } from "@/lib/kling";
import { checkExportAllowed } from "@/lib/entitlement";

import { checkRateLimit, getClientIP, PAID_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { MAX_IMAGE_B64_CHARS, MAX_PROMPT_CHARS, overStringLimit, tooLargeResponse } from "@/lib/input-bounds";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Max request body size: 20 MB (base64-encoded photos). */
const MAX_BODY_SIZE = 20 * 1024 * 1024;

/**
 * API route handler for submitting photo animations.
 *
 * Uses a route handler instead of a server action to avoid React Flight
 * serialization limits — large base64 data URIs (multi-MB photos) exceed
 * the maximum array nesting depth in React 19's Flight protocol.
 * P0: requires userId + enforces freemium quota server-side before any paid call.
 */
export async function POST(req: Request) {
  // H1: per-IP rate limit — this route triggers a paid API call, so throttle
  // request floods even before the quota gate (Track H1).
  const rl = checkRateLimit(`animate-submit:${getClientIP(req)}`, PAID_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    // Check Content-Length to reject oversized payloads early
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      console.warn(`[animate/submit] Rejected: payload too large (${contentLength} bytes)`);
      return tooLargeResponse();
    }

    const { userId, signedTransaction, imageData, prompt, duration } = await req.json();

    if (!userId || typeof userId !== "string") {
      console.warn("[animate/submit] Rejected: missing or invalid userId");
      return Response.json({ error: "userId is required" }, { status: 400 });
    }
    // H2: field-level size bounds before the quota gate (complements the body-size cap).
    if (overStringLimit(prompt, MAX_PROMPT_CHARS) || overStringLimit(imageData, MAX_IMAGE_B64_CHARS)) {
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
      console.warn("[animate/submit] Rejected: missing or invalid imageData");
      return Response.json({ error: "imageData is required" }, { status: 400 });
    }
    if (!prompt || typeof prompt !== "string") {
      console.warn("[animate/submit] Rejected: missing or invalid prompt");
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }

    // Validate duration is a number in acceptable range
    const dur = typeof duration === "number" && Number.isFinite(duration) ? Math.max(2, Math.min(10, duration)) : 5;

    const imagePrefix = imageData.slice(0, 30);
    const imageSize = imageData.length;
    console.log(`[animate/submit] Submitting: prompt="${prompt.slice(0, 80)}...", duration=${dur}s, imageSize=${(imageSize / 1024).toFixed(0)}KB, imagePrefix="${imagePrefix}..."`);

    const predictionId = await submitPhotoAnimation(imageData, prompt, dur);
    console.log(`[animate/submit] Success: predictionId=${predictionId}`);
    return Response.json({ predictionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[animate/submit] Error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
