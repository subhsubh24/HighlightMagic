import { submitBackgroundRemoval } from "@/lib/atlascloud";
import { checkExportAllowed } from "@/lib/entitlement";

import { checkRateLimit, getClientIP, PAID_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { MAX_IMAGE_B64_CHARS, overStringLimit, tooLargeResponse } from "@/lib/input-bounds";

export const runtime = "nodejs";

/** Max request body size: 20 MB. */
const MAX_BODY_SIZE = 20 * 1024 * 1024;

/**
 * Generate a thumbnail by removing the background from a key frame.
 * Step 1 of thumbnail generation — returns prediction ID for BG removal.
 * The client uses the result to composite onto a styled backdrop.
 */
export async function POST(req: Request) {
  // H1: per-IP rate limit — this route triggers a paid API call, so throttle
  // request floods even before the quota gate (Track H1).
  const rl = checkRateLimit(`thumbnail:${getClientIP(req)}`, PAID_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return Response.json({ error: "Request body too large" }, { status: 413 });
    }

    const { userId, signedTransaction, imageData } = await req.json();

    if (!userId || typeof userId !== "string") {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }
    if (!imageData || typeof imageData !== "string") {
      return Response.json({ error: "imageData is required" }, { status: 400 });
    }
    // H2: field-level image-size bound before the paid background-removal job.
    if (overStringLimit(imageData, MAX_IMAGE_B64_CHARS)) return tooLargeResponse();

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

    const predictionId = await submitBackgroundRemoval(imageData);
    return Response.json({ predictionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[thumbnail] Error:", message);
    return Response.json(
      { error: "Thumbnail generation failed" },
      { status: 500 }
    );
  }
}
