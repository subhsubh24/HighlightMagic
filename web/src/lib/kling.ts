/**
 * Atlas Cloud API client for Kling 3.0 image-to-video generation.
 * Server-side only — requires ATLASCLOUD_API_KEY env var.
 */

const ATLAS_API_BASE = "https://api.atlascloud.ai/api/v1/model";
const MODEL_ID = "kwaivgi/kling-v3.0-pro/image-to-video";

/** How often to poll for results (ms) */
const POLL_INTERVAL_MS = 5_000;
/** Max time to wait for generation (ms) */
const POLL_TIMEOUT_MS = 180_000; // 3 minutes

interface GenerateVideoResponse {
  data: {
    id: string;
  };
}

interface PredictionResponse {
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string[];
  error?: string;
}

function getApiKey(): string {
  const key = process.env.ATLASCLOUD_API_KEY;
  if (!key) {
    throw new Error("ATLASCLOUD_API_KEY is not configured. Photo animation requires an Atlas Cloud API key.");
  }
  return key;
}

/**
 * Submit an image-to-video generation task to Atlas Cloud (Kling 3.0).
 * Returns the prediction ID for polling.
 */
export async function submitPhotoAnimation(
  imageUrl: string,
  prompt: string,
  duration: number = 5
): Promise<string> {
  const apiKey = getApiKey();

  const response = await fetch(`${ATLAS_API_BASE}/generateVideo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_ID,
      image: imageUrl,
      prompt,
      duration,
      cfg_scale: 0.5,
      sound: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Atlas Cloud API error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as GenerateVideoResponse;
  if (!data?.data?.id) {
    throw new Error("Atlas Cloud API returned no prediction ID");
  }

  return data.data.id;
}

/**
 * Poll for the result of a photo animation task.
 * Returns the generated video URL on success.
 */
export async function pollAnimationResult(predictionId: string): Promise<string> {
  const apiKey = getApiKey();
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const response = await fetch(`${ATLAS_API_BASE}/prediction/${predictionId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Atlas Cloud poll error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as PredictionResponse;

    if (data.status === "succeeded") {
      if (!data.output || data.output.length === 0) {
        throw new Error("Animation succeeded but no output video URL returned");
      }
      return data.output[0];
    }

    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(`Animation ${data.status}: ${data.error ?? "unknown error"}`);
    }

    // Still processing — wait before next poll
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Animation timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

/**
 * Generate a video from a photo in one call (submit + poll).
 * Returns the video URL.
 */
export async function generatePhotoAnimation(
  imageUrl: string,
  prompt: string,
  duration: number = 5
): Promise<string> {
  const predictionId = await submitPhotoAnimation(imageUrl, prompt, duration);
  return pollAnimationResult(predictionId);
}
