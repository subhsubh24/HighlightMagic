import { generateVoiceover } from "@/lib/elevenlabs-tts";
import { checkExportAllowed } from "@/lib/entitlement";
import { enforceGenerationCeiling } from "@/lib/spend-ceiling";

import { checkRateLimit, getClientIP, PAID_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Generate a voiceover segment from text (ElevenLabs TTS v3).
 * Claude decides the script and voice character; this renders the audio.
 *
 * P0: requires userId + enforces freemium quota server-side before any paid call.
 */
export async function POST(req: Request) {
  // H1: per-IP rate limit — this route triggers a paid API call, so throttle
  // request floods even before the quota gate (Track H1).
  const rl = checkRateLimit(`voiceover:${getClientIP(req)}`, PAID_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const { userId, signedTransaction, text, voiceCharacter } = await req.json();

    if (!userId || typeof userId !== "string") {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }
    if (!text || typeof text !== "string") {
      return Response.json({ error: "text is required" }, { status: 400 });
    }
    if (text.length > 1000) {
      return Response.json(
        { error: "text must be 1000 characters or fewer" },
        { status: 400 }
      );
    }

    // ── SERVER-SIDE GATE — before any paid call ──
    const decision = await checkExportAllowed({ userId, signedTransaction });
    if (!decision.allowed) {
      return Response.json(
        { error: decision.reason ?? "quota exceeded", remaining: 0, limit: decision.limit, upgrade: !decision.isPro },
        { status: 402 },
      );
    }

    // H7: per-user daily generation ceiling — wallet-drain backstop independent of the
    // per-IP rate limit and the monthly export quota (this sub-call does not consume it).
    const genBlock = enforceGenerationCeiling(userId);
    if (genBlock) return genBlock;

    const result = await generateVoiceover(
      text,
      typeof voiceCharacter === "string" ? voiceCharacter : undefined
    );

    if (result.status === "failed") {
      return Response.json(
        { error: result.error ?? "Voiceover generation failed" },
        { status: 502 }
      );
    }

    return Response.json({
      status: "completed",
      audioUrl: result.audioUrl,
      duration: result.duration,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[voiceover] Error:", message);
    return Response.json(
      { error: "Voiceover generation failed" },
      { status: 500 }
    );
  }
}
