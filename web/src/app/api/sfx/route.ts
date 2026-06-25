import { generateSoundEffect } from "@/lib/elevenlabs-sfx";
import { lookupSfxLibrary, cacheSfxResult } from "@/lib/sfx-library";
import { checkExportAllowed } from "@/lib/entitlement";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Generate a sound effect from a text prompt (ElevenLabs SFX v2).
 * Checks the pre-generated SFX library first to avoid redundant API calls.
 *
 * P0: requires userId + enforces freemium quota server-side before any paid call.
 */
export async function POST(req: Request) {
  try {
    const { userId, signedTransaction, prompt, durationMs } = await req.json();

    if (!userId || typeof userId !== "string") {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }
    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }
    if (prompt.length > 500) {
      return Response.json(
        { error: "prompt must be 500 characters or fewer" },
        { status: 400 }
      );
    }

    // Check pre-generated SFX library first (instant, free — no quota needed)
    const libraryHit = lookupSfxLibrary(prompt);
    if (libraryHit) {
      console.log(`[sfx] Library hit for "${prompt.slice(0, 60)}"`);
      return Response.json({
        status: "completed",
        audioUrl: libraryHit.url,
        duration: libraryHit.duration,
      });
    }

    // ── SERVER-SIDE GATE — before any paid call ──
    const decision = await checkExportAllowed({ userId, signedTransaction });
    if (!decision.allowed) {
      return Response.json(
        { error: decision.reason ?? "quota exceeded", remaining: 0, limit: decision.limit, upgrade: !decision.isPro },
        { status: 402 },
      );
    }

    const result = await generateSoundEffect(
      prompt,
      typeof durationMs === "number" ? durationMs : 2_000
    );

    if (result.status === "failed") {
      return Response.json(
        { error: result.error ?? "SFX generation failed" },
        { status: 502 }
      );
    }

    // Cache the generated result for future lookups
    if (result.audioUrl) {
      cacheSfxResult(prompt, result.audioUrl, result.duration ?? 1);
    }

    return Response.json({
      status: "completed",
      audioUrl: result.audioUrl,
      duration: result.duration,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sfx] Error:", message);
    return Response.json({ error: "SFX generation failed" }, { status: 500 });
  }
}
