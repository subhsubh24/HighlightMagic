/**
 * Atlas Cloud API client for Kling 3.0 image-to-video generation.
 * Server-side only — requires ATLASCLOUD_API_KEY env var.
 */

const ATLAS_API_BASE = "https://api.atlascloud.ai/api/v1/model";
const MODEL_ID = "kwaivgi/kling-v3.0-std/image-to-video";

/** How often to poll for results (ms) */
const POLL_INTERVAL_MS = 5_000;
/** Max time to wait for generation (ms) */
const POLL_TIMEOUT_MS = 300_000; // 5 minutes

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

  // Strip data URI prefix if present — Atlas Cloud expects raw base64 or a URL
  let image = imageUrl;
  const dataUriMatch = imageUrl.match(/^data:[^;]+;base64,(.+)$/s);
  if (dataUriMatch) {
    image = dataUriMatch[1];
  }

  const response = await fetch(`${ATLAS_API_BASE}/generateVideo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_ID,
      image,
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

export interface AnimationPollResult {
  status: "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
}

/**
 * Check the status of a photo animation task (single request, no loop).
 * Use this from a client-side polling loop to avoid server action timeouts.
 */
export async function checkAnimationResult(predictionId: string): Promise<AnimationPollResult> {
  const apiKey = getApiKey();

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
      return { status: "failed", error: "Animation succeeded but no output video URL returned" };
    }
    return { status: "completed", videoUrl: data.output[0] };
  }

  if (data.status === "failed" || data.status === "canceled") {
    return { status: "failed", error: data.error ?? "unknown error" };
  }

  // Still starting or processing
  return { status: "processing" };
}

/**
 * Poll for the result of a photo animation task (loops until done).
 * Use this for server-side contexts where long-running is OK.
 */
export async function pollAnimationResult(predictionId: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const result = await checkAnimationResult(predictionId);

    if (result.status === "completed") return result.videoUrl!;
    if (result.status === "failed") throw new Error(`Animation failed: ${result.error}`);

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
