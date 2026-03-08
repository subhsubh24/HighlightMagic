/**
 * ElevenLabs Sound Effects (SFX v2) API client.
 *
 * Generates short sound effects from text prompts — whooshes, impacts,
 * crowd roars, risers, etc. Used for transition SFX and moment accents.
 *
 * Synchronous endpoint — returns audio directly (like music, unlike Kling).
 * Server-side only — requires ELEVENLABS_API_KEY env var.
 */

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

/** Max SFX duration (ms). Most transition SFX are 1-3 seconds. */
const MAX_SFX_DURATION_MS = 10_000;

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY is not configured. Sound effects require an ElevenLabs API key."
    );
  }
  return key;
}

export interface SfxGenerateResult {
  status: "completed" | "failed";
  /** Base64-encoded audio data URI */
  audioUrl?: string;
  /** Estimated duration in seconds */
  duration?: number;
  error?: string;
}

/**
 * Generate a sound effect from a text prompt.
 * Returns the audio as a base64 data URI (MP3).
 */
export async function generateSoundEffect(
  prompt: string,
  durationMs: number = 2_000
): Promise<SfxGenerateResult> {
  const apiKey = getApiKey();
  const safeDuration = Number.isFinite(durationMs) ? durationMs : 2_000;
  const clampedDuration = Math.max(500, Math.min(safeDuration, MAX_SFX_DURATION_MS));

  console.log(
    `[elevenlabs-sfx] Generating: "${prompt.slice(0, 80)}..." (${clampedDuration}ms)`
  );

  const response = await fetch(
    `${ELEVENLABS_API_BASE}/sound-generation`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: clampedDuration / 1000,
      }),
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(
      `[elevenlabs-sfx] API error (${response.status}):`,
      errorText
    );
    return {
      status: "failed",
      error: `ElevenLabs SFX API error (${response.status})`,
    };
  }

  const audioBuffer = await response.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    return { status: "failed", error: "Empty audio response from ElevenLabs" };
  }

  const base64 = Buffer.from(audioBuffer).toString("base64");
  const audioUrl = `data:audio/mpeg;base64,${base64}`;
  const estimatedDuration = Math.round(audioBuffer.byteLength / 16_000);

  console.log(
    `[elevenlabs-sfx] Generated ${audioBuffer.byteLength} bytes (~${estimatedDuration}s)`
  );

  return { status: "completed", audioUrl, duration: estimatedDuration };
}

/**
 * Generate multiple sound effects in parallel.
 * Used to batch-generate all SFX for a highlight tape at once.
 */
export async function generateSoundEffectBatch(
  requests: Array<{ prompt: string; durationMs?: number }>
): Promise<SfxGenerateResult[]> {
  return Promise.all(
    requests.map((req) =>
      generateSoundEffect(req.prompt, req.durationMs ?? 2_000)
    )
  );
}
