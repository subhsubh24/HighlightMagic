/**
 * ElevenLabs Text-to-Speech (v3) API client.
 *
 * Generates AI voiceover segments for highlight tape narration.
 * Claude decides the script and voice character; this module renders audio.
 *
 * Synchronous endpoint — returns audio stream directly.
 * Server-side only — requires ELEVENLABS_API_KEY env var.
 */

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

/**
 * Pre-mapped voice characters → ElevenLabs voice IDs.
 * Claude outputs a character string; we resolve it to an actual voice.
 * These are ElevenLabs' built-in high-quality voices (no cloning needed).
 */
const VOICE_MAP: Record<string, string> = {
  // Male voices
  "male-broadcaster-hype": "pNInz6obpgDQGcFmaJgB",    // Adam — deep, energetic
  "male-narrator-warm": "VR6AewLTigWG4xSOukaG",       // Arnold — warm, authoritative
  "male-young-energetic": "ErXwobaYiN019PkySvjV",      // Antoni — young, dynamic
  // Female voices
  "female-narrator-warm": "EXAVITQu4vr4xnSDxMaL",     // Bella — warm, engaging
  "female-broadcaster-hype": "MF3mGyEYCl7XYWbV9V6O",   // Emily — energetic, clear
  "female-young-energetic": "jBpfAIEiAdjNBVLkP4cg",    // Jessie — bright, punchy
};

/** Default voice when Claude's choice doesn't match our map */
const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // Adam

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY is not configured. AI voiceover requires an ElevenLabs API key."
    );
  }
  return key;
}

export interface TtsGenerateResult {
  status: "completed" | "failed";
  /** Base64-encoded audio data URI (MP3) */
  audioUrl?: string;
  /** Estimated duration in seconds */
  duration?: number;
  error?: string;
}

/**
 * Resolve a Claude-chosen voice character string to an ElevenLabs voice ID.
 */
export function resolveVoiceId(voiceCharacter: string): string {
  return VOICE_MAP[voiceCharacter] ?? DEFAULT_VOICE_ID;
}

/**
 * Generate a single voiceover segment.
 * Returns the audio as a base64 data URI (MP3).
 */
export async function generateVoiceover(
  text: string,
  voiceCharacter: string = "male-broadcaster-hype"
): Promise<TtsGenerateResult> {
  const apiKey = getApiKey();
  const voiceId = resolveVoiceId(voiceCharacter);

  console.log(
    `[elevenlabs-tts] Generating: "${text.slice(0, 80)}..." (voice: ${voiceCharacter} → ${voiceId})`
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
        model_id: "eleven_multilingual_v2",
        output_format: "mp3_44100_128",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(
      `[elevenlabs-tts] API error (${response.status}):`,
      errorText
    );
    return {
      status: "failed",
      error: `ElevenLabs TTS API error (${response.status})`,
    };
  }

  const audioBuffer = await response.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    return { status: "failed", error: "Empty audio response from ElevenLabs" };
  }

  const base64 = Buffer.from(audioBuffer).toString("base64");
  const audioUrl = `data:audio/mpeg;base64,${base64}`;
  // MP3 128kbps ≈ 16KB/s
  const estimatedDuration = Math.round(audioBuffer.byteLength / 16_000);

  console.log(
    `[elevenlabs-tts] Generated ${audioBuffer.byteLength} bytes (~${estimatedDuration}s)`
  );

  return { status: "completed", audioUrl, duration: estimatedDuration };
}

/**
 * Generate all voiceover segments for a highlight tape.
 * Runs sequentially to maintain consistent voice quality across segments.
 */
export async function generateVoiceovers(
  segments: Array<{ text: string; clipIndex: number }>,
  voiceCharacter: string = "male-broadcaster-hype"
): Promise<Array<{ clipIndex: number; result: TtsGenerateResult }>> {
  const results: Array<{ clipIndex: number; result: TtsGenerateResult }> = [];

  for (const segment of segments) {
    const result = await generateVoiceover(segment.text, voiceCharacter);
    results.push({ clipIndex: segment.clipIndex, result });
  }

  return results;
}
