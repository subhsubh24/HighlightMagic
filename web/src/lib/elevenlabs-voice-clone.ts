/**
 * ElevenLabs Voice Cloning API client.
 *
 * Creates an Instant Voice Clone from a short audio sample (~30s),
 * then uses it for voiceover generation. Enables athletes to narrate
 * their own highlight tapes or coaches to narrate team reels.
 *
 * Flow: Upload voice sample → Create clone → Use cloned voice ID for TTS.
 * Server-side only — requires ELEVENLABS_API_KEY env var.
 */

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY is not configured. Voice cloning requires an ElevenLabs API key."
    );
  }
  return key;
}

export interface VoiceCloneResult {
  status: "completed" | "failed";
  /** The ElevenLabs voice ID for the cloned voice */
  voiceId?: string;
  error?: string;
}

/**
 * Create an Instant Voice Clone from an audio sample.
 * Accepts a Blob or Buffer of audio data (MP3, WAV, M4A — at least 10s recommended).
 * Returns a voice ID that can be used with the TTS endpoint.
 */
export async function createVoiceClone(
  audioData: Blob | Buffer,
  name: string = "My Voice",
  fileName: string = "voice-sample.mp3"
): Promise<VoiceCloneResult> {
  const apiKey = getApiKey();

  console.log(
    `[elevenlabs-voice-clone] Creating clone "${name}" from ${fileName} (${audioData instanceof Blob ? audioData.size : audioData.byteLength} bytes)`
  );

  const formData = new FormData();
  const blob =
    audioData instanceof Blob
      ? audioData
      : new Blob([new Uint8Array(audioData)], { type: "audio/mpeg" });
  formData.append("files", blob, fileName);
  formData.append("name", name);
  formData.append("description", "Voice clone for highlight tape narration");

  const response = await fetch(`${ELEVENLABS_API_BASE}/voices/add`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: formData,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(
      `[elevenlabs-voice-clone] API error (${response.status}):`,
      errorText
    );
    return {
      status: "failed",
      error: `Voice cloning failed (${response.status})`,
    };
  }

  const data = await response.json();
  if (!data.voice_id) {
    return { status: "failed", error: "No voice ID returned from cloning" };
  }

  console.log(`[elevenlabs-voice-clone] Clone created: ${data.voice_id}`);
  return { status: "completed", voiceId: data.voice_id };
}

/**
 * Delete a cloned voice (cleanup after export).
 */
export async function deleteVoiceClone(voiceId: string): Promise<void> {
  const apiKey = getApiKey();
  try {
    await fetch(`${ELEVENLABS_API_BASE}/voices/${voiceId}`, {
      method: "DELETE",
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(30_000),
    });
    console.log(`[elevenlabs-voice-clone] Deleted clone: ${voiceId}`);
  } catch (e) {
    console.warn(`[elevenlabs-voice-clone] Failed to delete clone:`, e);
  }
}

/**
 * Generate voiceover using a cloned voice ID (bypasses VOICE_MAP).
 * Returns the audio as a base64 data URI.
 */
export async function generateWithClonedVoice(
  text: string,
  voiceId: string
): Promise<{ status: "completed" | "failed"; audioUrl?: string; duration?: number; error?: string }> {
  const apiKey = getApiKey();

  console.log(
    `[elevenlabs-voice-clone] Generating TTS with clone ${voiceId}: "${text.slice(0, 80)}..."`
  );

  const response = await fetch(
    `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        output_format: "mp3_44100_64",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.85,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return { status: "failed", error: `TTS with cloned voice failed (${response.status}): ${errorText}` };
  }

  const audioBuffer = await response.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    return { status: "failed", error: "Empty audio response" };
  }

  const base64 = Buffer.from(audioBuffer).toString("base64");
  const audioUrl = `data:audio/mpeg;base64,${base64}`;
  // MP3 64kbps ≈ 8KB/s
  const estimatedDuration = Math.round(audioBuffer.byteLength / 8_000);

  return { status: "completed", audioUrl, duration: estimatedDuration };
}
