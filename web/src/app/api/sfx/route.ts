import { generateSoundEffect } from "@/lib/elevenlabs-sfx";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Generate a sound effect from a text prompt (ElevenLabs SFX v2).
 * Used for transition whooshes, impact hits, crowd roars, etc.
 */
export async function POST(req: Request) {
  try {
    const { prompt, durationMs } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }
    if (prompt.length > 500) {
      return Response.json(
        { error: "prompt must be 500 characters or fewer" },
        { status: 400 }
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
