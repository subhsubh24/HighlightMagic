import { createVoiceClone } from "@/lib/elevenlabs-voice-clone";
import { checkExportAllowed } from "@/lib/entitlement";
import { enforceGenerationCeiling } from "@/lib/spend-ceiling";

import { checkRateLimit, getClientIP, PAID_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
// B6 resilience: this route uploads an audio sample to ElevenLabs' voice-clone
// endpoint (a 30s-bounded call). Without an explicit budget the function inherits
// the short platform default and is killed mid-upload → silent "request failed".
// 60s comfortably exceeds the single 30s provider call.
export const maxDuration = 60;

/** Max voice sample size: 10 MB */
const MAX_BODY_SIZE = 10 * 1024 * 1024;

/**
 * Create an Instant Voice Clone from an audio sample.
 * Accepts multipart form data with "audio" file field + userId.
 * Returns {voiceId} on success.
 * P0: requires userId + enforces freemium quota server-side before any paid call.
 */
export async function POST(req: Request) {
  // H1: per-IP rate limit — this route triggers a paid API call, so throttle
  // request floods even before the quota gate (Track H1).
  const rl = checkRateLimit(`voice-clone:${getClientIP(req)}`, PAID_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return Response.json({ error: "Voice sample too large (max 10MB)" }, { status: 413 });
    }

    const formData = await req.formData();
    const userId = (formData.get("userId") as string | null) ?? "";
    const signedTransaction = (formData.get("signedTransaction") as string | null) ?? null;
    const audioFile = formData.get("audio") as Blob | null;
    const name = (formData.get("name") as string) || "My Voice";

    if (!userId) {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }

    const decision = await checkExportAllowed({ userId, signedTransaction });
    if (!decision.allowed) {
      return Response.json(
        { error: decision.reason ?? "quota exceeded", remaining: 0, limit: decision.limit, upgrade: !decision.isPro },
        { status: 402 }
      );
    }

    if (!audioFile) {
      return Response.json({ error: "audio file is required" }, { status: 400 });
    }

    // H7: per-user daily generation ceiling — wallet-drain backstop independent of the
    // per-IP rate limit and the monthly export quota (this sub-call does not consume it).
    const genBlock = await enforceGenerationCeiling(userId);
    if (genBlock) return genBlock;

    const result = await createVoiceClone(audioFile, name, "voice-sample.mp3");
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[voice-clone] Error:", message);
    return Response.json(
      { status: "failed", error: "Voice cloning failed" },
      { status: 500 }
    );
  }
}
