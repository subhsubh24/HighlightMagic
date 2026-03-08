/**
 * ElevenLabs Scribe (Speech-to-Text) API client.
 *
 * Transcribes audio from uploaded videos to enhance AI detection.
 * The transcript + audio energy data feeds into Claude's planning prompt,
 * giving it both visual AND audio intelligence for highlight selection.
 *
 * Server-side only — requires ELEVENLABS_API_KEY env var.
 */

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY is not configured. Audio transcription requires an ElevenLabs API key."
    );
  }
  return key;
}

export interface TranscriptWord {
  text: string;
  start: number; // seconds
  end: number;   // seconds
  confidence: number;
}

export interface TranscriptSegment {
  text: string;
  start: number; // seconds
  end: number;   // seconds
  words: TranscriptWord[];
}

export interface ScribeResult {
  status: "completed" | "failed";
  /** Full transcript text */
  text?: string;
  /** Word-level timing data */
  segments?: TranscriptSegment[];
  /** Detected language */
  language?: string;
  error?: string;
}

/**
 * Transcribe an audio file using ElevenLabs Scribe v2.
 * Accepts a File, Blob, or Buffer containing audio/video data.
 *
 * Returns word-level timestamps so we can correlate with frame scoring.
 */
export async function transcribeAudio(
  audioData: Blob | Buffer,
  fileName: string = "audio.mp3"
): Promise<ScribeResult> {
  const apiKey = getApiKey();

  console.log(
    `[elevenlabs-scribe] Transcribing "${fileName}" (${(audioData instanceof Blob ? audioData.size : audioData.byteLength)} bytes)`
  );

  const formData = new FormData();
  const blob =
    audioData instanceof Blob
      ? audioData
      : new Blob([new Uint8Array(audioData)], { type: "audio/mpeg" });
  formData.append("file", blob, fileName);
  formData.append("model_id", "scribe_v1");
  formData.append("timestamps_granularity", "word");

  const response = await fetch(
    `${ELEVENLABS_API_BASE}/speech-to-text`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
      },
      body: formData,
      signal: AbortSignal.timeout(60_000),
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(
      `[elevenlabs-scribe] API error (${response.status}):`,
      errorText
    );
    return {
      status: "failed",
      error: `ElevenLabs Scribe API error (${response.status})`,
    };
  }

  const data = await response.json();

  // Extract segments with word-level timing
  const segments: TranscriptSegment[] = [];
  if (Array.isArray(data.words)) {
    // Group words into sentence-like segments (split on pauses > 1s)
    let currentSegment: TranscriptWord[] = [];
    for (const word of data.words) {
      if (
        currentSegment.length > 0 &&
        word.start - currentSegment[currentSegment.length - 1].end > 1.0
      ) {
        // Gap > 1 second — start new segment
        segments.push({
          text: currentSegment.map((w) => w.text).join(" "),
          start: currentSegment[0].start,
          end: currentSegment[currentSegment.length - 1].end,
          words: currentSegment,
        });
        currentSegment = [];
      }
      currentSegment.push({
        text: word.text,
        start: word.start,
        end: word.end,
        confidence: word.confidence ?? 1.0,
      });
    }
    // Push final segment
    if (currentSegment.length > 0) {
      segments.push({
        text: currentSegment.map((w) => w.text).join(" "),
        start: currentSegment[0].start,
        end: currentSegment[currentSegment.length - 1].end,
        words: currentSegment,
      });
    }
  }

  const fullText = data.text ?? segments.map((s) => s.text).join(" ");

  console.log(
    `[elevenlabs-scribe] Transcribed: ${segments.length} segments, ${fullText.length} chars, language=${data.language_code ?? "unknown"}`
  );

  return {
    status: "completed",
    text: fullText,
    segments,
    language: data.language_code,
  };
}
