import { createVoiceClone } from "@/lib/elevenlabs-voice-clone";

export const runtime = "nodejs";

/** Max voice sample size: 10 MB */
const MAX_BODY_SIZE = 10 * 1024 * 1024;

/**
 * Create an Instant Voice Clone from an audio sample.
 * Accepts multipart form data with an "audio" file field.
 * Returns {voiceId} on success.
 */
export async function POST(req: Request) {
  try {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return Response.json({ error: "Voice sample too large (max 10MB)" }, { status: 413 });
    }

    const formData = await req.formData();
    const audioFile = formData.get("audio") as Blob | null;
    const name = (formData.get("name") as string) || "My Voice";

    if (!audioFile) {
      return Response.json({ error: "audio file is required" }, { status: 400 });
    }

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
