import { generateVoiceover } from "@/lib/elevenlabs-tts";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Generate a voiceover segment from text (ElevenLabs TTS v3).
 * Claude decides the script and voice character; this renders the audio.
 */
export async function POST(req: Request) {
  try {
    const { text, voiceCharacter } = await req.json();

    if (!text || typeof text !== "string") {
      return Response.json({ error: "text is required" }, { status: 400 });
    }
    if (text.length > 1000) {
      return Response.json(
        { error: "text must be 1000 characters or fewer" },
        { status: 400 }
      );
    }

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
