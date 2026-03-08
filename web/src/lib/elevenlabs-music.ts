/**
 * ElevenLabs Music API client for AI music generation.
 * Uses the Eleven Music model (synchronous streaming endpoint).
 * Server-side only — requires ELEVENLABS_API_KEY env var.
 *
 * The compose endpoint returns a readable audio stream directly,
 * so no submit/poll pattern is needed (unlike Kling).
 */

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

/** Max music length we request (ms). 60s default for highlight tapes. */
const DEFAULT_MUSIC_LENGTH_MS = 60_000;
/** Absolute max the API supports (5 min). */
const MAX_MUSIC_LENGTH_MS = 300_000;

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error("ELEVENLABS_API_KEY is not configured. AI music generation requires an ElevenLabs API key.");
  }
  return key;
}

export interface MusicGenerateResult {
  status: "completed" | "failed";
  /** Base64-encoded MP3 audio data (data URI) */
  audioUrl?: string;
  duration?: number;
  error?: string;
}

/**
 * Generate music using ElevenLabs Eleven Music.
 * Returns the audio as a base64 data URI (MP3).
 *
 * This is a synchronous call — the API streams the audio back directly.
 * Typical generation takes 10-30 seconds.
 */
export async function generateMusic(
  prompt: string,
  durationMs: number = DEFAULT_MUSIC_LENGTH_MS
): Promise<MusicGenerateResult> {
  const apiKey = getApiKey();
  const safeDuration = Number.isFinite(durationMs) ? durationMs : DEFAULT_MUSIC_LENGTH_MS;
  const clampedDuration = Math.max(3_000, Math.min(safeDuration, MAX_MUSIC_LENGTH_MS));

  console.log(`[elevenlabs-music] Generating: "${prompt.slice(0, 80)}..." (${clampedDuration}ms)`);

  const response = await fetch(`${ELEVENLABS_API_BASE}/music/compose`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      prompt,
      music_length_ms: clampedDuration,
      output_format: "mp3_44100_128",
    }),
    signal: AbortSignal.timeout(120_000), // Music generation can take 30-60s
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(`[elevenlabs-music] API error (${response.status}):`, errorText);

    // Parse ElevenLabs error format
    try {
      const errorData = JSON.parse(errorText);
      if (errorData?.detail?.status === "bad_prompt") {
        return {
          status: "failed",
          error: errorData.detail.message || "Prompt was rejected — try different wording (no artist/song names).",
        };
      }
    } catch {
      // Not JSON, use generic error
    }

    return {
      status: "failed",
      error: `ElevenLabs API error (${response.status})`,
    };
  }

  // Read the streaming response into a buffer
  const audioBuffer = await response.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    return { status: "failed", error: "Empty audio response from ElevenLabs" };
  }

  // Convert to base64 data URI for client consumption
  const base64 = Buffer.from(audioBuffer).toString("base64");
  const audioUrl = `data:audio/mpeg;base64,${base64}`;

  // Estimate duration from file size (MP3 128kbps ≈ 16KB/s)
  const estimatedDuration = Math.round(audioBuffer.byteLength / 16_000);

  console.log(`[elevenlabs-music] Generated ${audioBuffer.byteLength} bytes (~${estimatedDuration}s)`);

  return {
    status: "completed",
    audioUrl,
    duration: estimatedDuration,
  };
}
