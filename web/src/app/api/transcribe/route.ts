import { transcribeAudio } from "@/lib/elevenlabs-scribe";

export const runtime = "nodejs";
export const maxDuration = 120; // Transcription of long videos can take time

/** Max request body size: 50 MB (video audio can be large). */
const MAX_BODY_SIZE = 50 * 1024 * 1024;

/**
 * Transcribe audio from a video file (ElevenLabs Scribe v2).
 * Returns word-level timestamps for audio-intelligent detection.
 *
 * Accepts either:
 * - multipart/form-data with a "file" field
 * - JSON with base64-encoded audio data
 */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    let audioBlob: Blob;
    let fileName = "audio.mp3";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof Blob)) {
        return Response.json(
          { error: "file is required in form data" },
          { status: 400 }
        );
      }
      if (file.size > MAX_BODY_SIZE) {
        return Response.json(
          { error: "File too large (max 50 MB)" },
          { status: 413 }
        );
      }
      audioBlob = file;
      if (file instanceof File) fileName = file.name;
    } else {
      const { audioData, name } = await req.json();
      if (!audioData || typeof audioData !== "string") {
        return Response.json(
          { error: "audioData is required" },
          { status: 400 }
        );
      }
      // Strip data URI prefix
      const base64 = audioData.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      if (buffer.byteLength > MAX_BODY_SIZE) {
        return Response.json(
          { error: "Audio data too large (max 50 MB)" },
          { status: 413 }
        );
      }
      audioBlob = new Blob([buffer], { type: "audio/mpeg" });
      if (name) fileName = name;
    }

    const result = await transcribeAudio(audioBlob, fileName);

    if (result.status === "failed") {
      return Response.json(
        { error: result.error ?? "Transcription failed" },
        { status: 502 }
      );
    }

    return Response.json({
      status: "completed",
      text: result.text,
      segments: result.segments,
      language: result.language,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transcribe] Error:", message);
    return Response.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}
