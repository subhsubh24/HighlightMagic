import { submitTextToVideo } from "@/lib/atlascloud";
import { checkExportAllowed } from "@/lib/entitlement";
import { enforceGenerationCeiling } from "@/lib/spend-ceiling";

import { checkRateLimit, getClientIP, PAID_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Submit an AI outro card generation (Atlas Cloud Text-to-Video).
 * Returns a prediction ID for polling via /api/animate/check (same poll endpoint).
 * P0: requires userId + enforces freemium quota server-side before any paid call.
 */
export async function POST(req: Request) {
  // H1: per-IP rate limit — this route triggers a paid API call, so throttle
  // request floods even before the quota gate (Track H1).
  const rl = checkRateLimit(`outro:${getClientIP(req)}`, PAID_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const { userId, signedTransaction, prompt, duration } = await req.json();

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
      typeof duration === "number" && Number.isFinite(duration) ? Math.max(2, Math.min(10, duration)) : 5;

    // H7: per-user daily generation ceiling — wallet-drain backstop independent of the
    // per-IP rate limit and the monthly export quota (this sub-call does not consume it).
    const genBlock = await enforceGenerationCeiling(userId);
    if (genBlock) return genBlock;

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
