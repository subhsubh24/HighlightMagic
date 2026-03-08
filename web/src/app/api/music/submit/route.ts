import { generateMusic } from "@/lib/elevenlabs-music";

export const runtime = "nodejs";

/** Increase timeout — ElevenLabs music generation can take 10-30s. */
export const maxDuration = 60;

/**
 * API route handler for AI music generation (ElevenLabs Eleven Music).
 * Synchronous — waits for generation and returns the audio directly.
 */
export async function POST(req: Request) {
  try {
    const { prompt, durationMs } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }
    if (prompt.length > 500) {
      return Response.json({ error: "prompt must be 500 characters or fewer" }, { status: 400 });
    }

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
