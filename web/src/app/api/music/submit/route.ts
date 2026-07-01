import { generateMusic } from "@/lib/elevenlabs-music";
import { checkExportAllowed } from "@/lib/entitlement";
import { enforceGenerationCeiling } from "@/lib/spend-ceiling";

import { checkRateLimit, getClientIP, PAID_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Increase timeout — ElevenLabs music generation can take 10-30s. */
export const maxDuration = 60;

/**
 * API route handler for AI music generation (ElevenLabs Eleven Music).
 * Synchronous — waits for generation and returns the audio directly.
 *
 * P0: requires userId + enforces freemium quota server-side before any paid call.
 */
export async function POST(req: Request) {
  // H1: per-IP rate limit — this route triggers a paid API call, so throttle
  // request floods even before the quota gate (Track H1).
  const rl = checkRateLimit(`music-submit:${getClientIP(req)}`, PAID_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const { userId, signedTransaction, prompt, durationMs } = await req.json();

    if (!userId || typeof userId !== "string") {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }
    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }
    if (prompt.length > 500) {
      return Response.json({ error: "prompt must be 500 characters or fewer" }, { status: 400 });
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
    const genBlock = await enforceGenerationCeiling(userId);
    if (genBlock) return genBlock;

    const result = await generateMusic(prompt, durationMs);

    if (result.status === "failed") {
      return Response.json(
        { error: result.error ?? "Music generation failed" },
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
    console.error("[music/generate] Error:", message);
    return Response.json({ error: "Music generation failed" }, { status: 500 });
  }
}
