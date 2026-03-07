/**
 * Atlas Cloud API client for Kling image-to-video generation.
 * Uses Kling v2.5 Turbo Pro — cheapest option at ~$0.06/1M tokens
 * (vs v3.0 Pro at $0.168/1M tokens, nearly 3x more expensive).
 * Server-side only — requires ATLASCLOUD_API_KEY env var.
 */

const ATLAS_API_BASE = "https://api.atlascloud.ai/api/v1/model";
const MODEL_ID = "kwaivgi/kling-v2.5-turbo-pro/image-to-video";

/** How often to poll for results (ms) */
const POLL_INTERVAL_MS = 5_000;
/** Max time to wait for generation (ms) */
const POLL_TIMEOUT_MS = 300_000; // 5 minutes

/** Retry config for transient API errors (502/503/504) */
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2_000; // 2s, 4s, 8s exponential backoff

interface GenerateVideoResponse {
  data: {
    id: string;
  };
}

interface AtlasEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

interface PredictionData {
  id: string;
  status: "created" | "starting" | "processing" | "succeeded" | "completed" | "failed" | "canceled";
  outputs?: string[] | null;
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

  // Atlas Cloud expects raw base64 (no data URI prefix) or a public URL.
  // Strip the data URI prefix if present.
  const image = imageUrl.replace(/^data:image\/[^;]+;base64,/, "");

  const requestBody = JSON.stringify({
    model: MODEL_ID,
    image,
    prompt,
    duration,
    cfg_scale: 0.5,
    sound: false,
  });

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.log(`[kling] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }

    const response = await fetch(`${ATLAS_API_BASE}/generateVideo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: requestBody,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      lastError = new Error(`Atlas Cloud API error (${response.status}): ${text}`);
      // Retry on gateway errors (502, 503, 504)
      if ([502, 503, 504].includes(response.status) && attempt < MAX_RETRIES) {
        console.warn(`[kling] Got ${response.status}, will retry...`);
        continue;
      }
      throw lastError;
    }

    const data = (await response.json()) as GenerateVideoResponse;
    console.log(`[kling] submit response:`, JSON.stringify(data));
    if (!data?.data?.id) {
      throw new Error("Atlas Cloud API returned no prediction ID");
    }

    return data.data.id;
  }

  throw lastError ?? new Error("Atlas Cloud API failed after retries");
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

  let lastError: Error | null = null;
  let envelope: AtlasEnvelope<PredictionData> | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.log(`[kling] Poll retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }

    const response = await fetch(`${ATLAS_API_BASE}/prediction/${predictionId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      lastError = new Error(`Atlas Cloud poll error (${response.status}): ${text}`);
      if ([502, 503, 504].includes(response.status) && attempt < MAX_RETRIES) {
        console.warn(`[kling] Poll got ${response.status}, will retry...`);
        continue;
      }
      throw lastError;
    }

    envelope = (await response.json()) as AtlasEnvelope<PredictionData>;
    break;
  }

  if (!envelope) {
    throw lastError ?? new Error("Atlas Cloud poll failed after retries");
  }
  const prediction = envelope.data;
  console.log(`[kling] prediction ${predictionId}: status=${prediction.status}, outputs=${JSON.stringify(prediction.outputs)}`);

  if (prediction.status === "succeeded" || prediction.status === "completed") {
    if (!prediction.outputs || prediction.outputs.length === 0) {
      return { status: "failed", error: "Animation succeeded but no output video URL returned" };
    }
    return { status: "completed", videoUrl: prediction.outputs[0] };
  }

  if (prediction.status === "failed" || prediction.status === "canceled") {
    return { status: "failed", error: prediction.error ?? "unknown error" };
  }

  // Still created, starting, or processing
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

    if (result.status === "completed") {
      if (!result.videoUrl) throw new Error("Animation completed but returned no video URL");
      return result.videoUrl;
    }
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
