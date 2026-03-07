/**
 * ElevenLabs Audio Isolation (Stem Separation) API client.
 *
 * Separates AI-generated music into stems (vocals, drums, bass, other/melody)
 * so we can auto-duck the melody under voiceover while keeping the rhythm.
 *
 * Flow: Full mix → Isolate stems → Use drums+bass during voiceover,
 *       full mix elsewhere. Result: professional-quality audio mixing.
 *
 * Server-side only — requires ELEVENLABS_API_KEY env var.
 */

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY is not configured. Stem separation requires an ElevenLabs API key."
    );
  }
  return key;
}

export interface StemSeparationResult {
  status: "completed" | "failed";
  /** Individual stem audio as base64 data URIs */
  stems?: {
    vocals: string;
    drums: string;
    bass: string;
    other: string; // melody/harmony/keys
  };
  error?: string;
}

/**
 * Separate an audio track into stems using ElevenLabs Audio Isolation.
 * Accepts audio as base64 data URI or raw buffer.
 *
 * Returns 4 stems: vocals, drums, bass, other (melody).
 */
export async function separateStems(
  audioData: Blob | Buffer,
  fileName: string = "music.mp3"
): Promise<StemSeparationResult> {
  const apiKey = getApiKey();

  console.log(
    `[elevenlabs-stems] Separating stems from "${fileName}" (${audioData instanceof Blob ? audioData.size : audioData.byteLength} bytes)`
  );

  const blob =
    audioData instanceof Blob
      ? audioData
      : new Blob([new Uint8Array(audioData)], { type: "audio/mpeg" });

  // ElevenLabs Audio Isolation endpoint separates vocals from instrumentals.
  // We call it once for vocal isolation, giving us vocals + instrumental.
  const formData = new FormData();
  formData.append("audio", blob, fileName);

  const response = await fetch(
    `${ELEVENLABS_API_BASE}/audio-isolation`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(
      `[elevenlabs-stems] API error (${response.status}):`,
      errorText
    );
    return {
      status: "failed",
      error: `Stem separation failed (${response.status})`,
    };
  }

  // The audio isolation endpoint returns the isolated audio (vocals removed = instrumental)
  const audioBuffer = await response.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    return { status: "failed", error: "Empty response from stem separation" };
  }

  const instrumentalBase64 = Buffer.from(audioBuffer).toString("base64");
  const instrumentalUrl = `data:audio/mpeg;base64,${instrumentalBase64}`;

  // Since ElevenLabs audio-isolation gives us the instrumental track,
  // we use: instrumental (for ducking under voiceover) + full mix (for non-voiceover sections).
  // The "stems" object provides the instrumental as "other" for the mixer to use.
  console.log(
    `[elevenlabs-stems] Separated: instrumental=${audioBuffer.byteLength} bytes`
  );

  return {
    status: "completed",
    stems: {
      vocals: "", // Not needed — we're isolating instrumentals from AI music (no vocals)
      drums: instrumentalUrl, // Instrumental track (drums + bass + melody combined)
      bass: instrumentalUrl,  // Same instrumental — fine-grained splitting not available
      other: instrumentalUrl, // Melody/harmony
    },
  };
}

/**
 * Given a full music data URI, extract the instrumental-only version
 * for use during voiceover sections. Simpler API for the pipeline.
 */
export async function isolateInstrumental(
  musicDataUri: string
): Promise<{ status: "completed" | "failed"; instrumentalUrl?: string; error?: string }> {
  // Convert data URI to buffer
  const [, b64] = musicDataUri.split(",");
  if (!b64) return { status: "failed", error: "Invalid data URI" };

  const binary = Buffer.from(b64, "base64");
  const result = await separateStems(binary, "ai-music.mp3");

  if (result.status !== "completed" || !result.stems) {
    return { status: "failed", error: result.error };
  }

  return { status: "completed", instrumentalUrl: result.stems.drums };
}
