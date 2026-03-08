/**
 * Generic Atlas Cloud API client.
 *
 * Atlas Cloud uses a single endpoint for all models — only the model ID and
 * payload shape change.  This module replaces the Kling-specific `kling.ts`
 * with a reusable submit → poll pattern that works for:
 *   - Image-to-video  (Kling v2.5 Turbo Pro)
 *   - Text-to-video   (Wan 2.6, Seedance 2.0, etc.)
 *   - Image upscaler
 *   - Background remover
 *
 * Server-side only — requires ATLASCLOUD_API_KEY env var.
 */

const ATLAS_API_BASE = "https://api.atlascloud.ai/api/v1/model";

// ── Model IDs ──

export const MODELS = {
  /** Image-to-video (photo animation) — cheapest Kling tier */
  KLING_I2V: "kwaivgi/kling-v2.5-turbo-pro/image-to-video",
  /** Text-to-video — Wan 2.6 (Alibaba) */
  WAN_T2V: "alibaba/wan-2.6/text-to-video",
  /** Image upscaler */
  IMAGE_UPSCALER: "atlascloud/image-upscaler",
  /** Background remover */
  BG_REMOVER: "atlascloud/image-background-remover",
  /** Lip sync — Wan 2.2 (photo + audio → talking head video) */
  WAN_LIPSYNC: "alibaba/wan-2.2/lip-sync",
  /** Video-to-video style transfer — Wan 2.6 */
  WAN_V2V: "alibaba/wan-2.6/video-to-video",
} as const;

export type AtlasModelId = (typeof MODELS)[keyof typeof MODELS];

// ── Polling config ──

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 300_000; // 5 minutes

// ── Retry config for transient API errors (502/503/504) ──

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2_000;
const FETCH_TIMEOUT_MS = 30_000; // 30s timeout for API calls

// ── Response types ──

interface AtlasEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

interface PredictionData {
  id: string;
  status:
    | "created"
    | "starting"
    | "processing"
    | "succeeded"
    | "completed"
    | "failed"
    | "canceled";
  outputs?: string[] | null;
  error?: string;
}

export interface TaskPollResult {
  status: "processing" | "completed" | "failed";
  outputUrl?: string;
  error?: string;
}

// ── Internals ──

function getApiKey(): string {
  const key = process.env.ATLASCLOUD_API_KEY;
  if (!key) {
    throw new Error(
      "ATLASCLOUD_API_KEY is not configured. Atlas Cloud features require an API key."
    );
  }
  return key;
}

/**
 * Submit a generation task to Atlas Cloud.
 * Returns the prediction ID for polling.
 *
 * The `endpoint` defaults to `generateVideo` for video models.
 * Image models use `generateImage`.
 */
export async function submitTask(
  modelId: string,
  payload: Record<string, unknown>,
  endpoint: "generateVideo" | "generateImage" = "generateVideo"
): Promise<string> {
  const apiKey = getApiKey();

  const requestBody = JSON.stringify({ model: modelId, ...payload });

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.log(
        `[atlascloud] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }

    const response = await fetch(`${ATLAS_API_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: requestBody,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      lastError = new Error(
        `Atlas Cloud API error (${response.status}): ${text}`
      );
      if (
        [502, 503, 504].includes(response.status) &&
        attempt < MAX_RETRIES
      ) {
        console.warn(`[atlascloud] Got ${response.status}, will retry...`);
        continue;
      }
      throw lastError;
    }

    const data = (await response.json()) as { data?: { id?: string } };
    console.log(`[atlascloud] submit response: id=${data?.data?.id ?? "none"}`);
    if (!data?.data?.id) {
      throw new Error("Atlas Cloud API returned no prediction ID");
    }

    return data.data.id;
  }

  throw lastError ?? new Error("Atlas Cloud API failed after retries");
}

/**
 * Check the status of a task (single request, no loop).
 * Used from a client-side polling loop.
 */
export async function checkTaskResult(
  predictionId: string
): Promise<TaskPollResult> {
  const apiKey = getApiKey();

  let lastError: Error | null = null;
  let envelope: AtlasEnvelope<PredictionData> | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.log(
        `[atlascloud] Poll retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }

    const response = await fetch(
      `${ATLAS_API_BASE}/prediction/${predictionId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      lastError = new Error(
        `Atlas Cloud poll error (${response.status}): ${text}`
      );
      if (
        [502, 503, 504].includes(response.status) &&
        attempt < MAX_RETRIES
      ) {
        console.warn(
          `[atlascloud] Poll got ${response.status}, will retry...`
        );
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
  console.log(
    `[atlascloud] prediction ${predictionId}: status=${prediction.status}, outputs=${JSON.stringify(prediction.outputs)}`
  );

  if (
    prediction.status === "succeeded" ||
    prediction.status === "completed"
  ) {
    if (!prediction.outputs || prediction.outputs.length === 0) {
      return {
        status: "failed",
        error: "Task succeeded but no output URL returned",
      };
    }
    return { status: "completed", outputUrl: prediction.outputs[0] };
  }

  if (prediction.status === "failed" || prediction.status === "canceled") {
    return { status: "failed", error: prediction.error ?? "unknown error" };
  }

  return { status: "processing" };
}

/**
 * Poll for result until done (loops until complete/failed or timeout).
 * Use this for server-side contexts where long-running is OK.
 */
export async function pollTaskResult(
  predictionId: string
): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const result = await checkTaskResult(predictionId);

    if (result.status === "completed") {
      if (!result.outputUrl)
        throw new Error("Task completed but returned no output URL");
      return result.outputUrl;
    }
    if (result.status === "failed")
      throw new Error(`Task failed: ${result.error}`);

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(
    `Task timed out after ${POLL_TIMEOUT_MS / 1000}s`
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// High-level convenience functions for specific models
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Photo animation (Kling v2.5 Turbo Pro image-to-video).
 * Backward-compatible replacement for the old kling.ts functions.
 */
export async function submitPhotoAnimation(
  imageUrl: string,
  prompt: string,
  duration: number = 5
): Promise<string> {
  const image = imageUrl.replace(/^data:image\/[^;]+;base64,/, "");
  return submitTask(MODELS.KLING_I2V, {
    image,
    prompt,
    duration: Math.max(2, Math.min(10, duration)),
    cfg_scale: 0.5,
    sound: false,
  });
}

/** Check animation status — delegates to generic checkTaskResult. */
export const checkAnimationResult = checkTaskResult;

/** Poll animation until done — delegates to generic pollTaskResult. */
export const pollAnimationResult = pollTaskResult;

/** One-shot photo animation (submit + poll). */
export async function generatePhotoAnimation(
  imageUrl: string,
  prompt: string,
  duration: number = 5
): Promise<string> {
  const predictionId = await submitPhotoAnimation(imageUrl, prompt, duration);
  return pollAnimationResult(predictionId);
}

/**
 * Text-to-video generation (Wan 2.6).
 * Used for AI intro/outro cards.
 */
export async function submitTextToVideo(
  prompt: string,
  duration: number = 5,
  aspectRatio: string = "9:16"
): Promise<string> {
  return submitTask(MODELS.WAN_T2V, {
    prompt,
    duration: Math.max(2, Math.min(10, duration)),
    aspect_ratio: aspectRatio,
  });
}

/** One-shot T2V (submit + poll). Returns video URL. */
export async function generateTextToVideo(
  prompt: string,
  duration: number = 5,
  aspectRatio: string = "9:16"
): Promise<string> {
  const predictionId = await submitTextToVideo(prompt, duration, aspectRatio);
  return pollTaskResult(predictionId);
}

/**
 * Image upscaler — enhances low-res photos before animation.
 * Returns the URL of the upscaled image.
 */
export async function submitImageUpscale(imageUrl: string): Promise<string> {
  const image = imageUrl.replace(/^data:image\/[^;]+;base64,/, "");
  return submitTask(
    MODELS.IMAGE_UPSCALER,
    { image },
    "generateImage"
  );
}

/** One-shot upscale (submit + poll). Returns upscaled image URL. */
export async function upscaleImage(imageUrl: string): Promise<string> {
  const predictionId = await submitImageUpscale(imageUrl);
  return pollTaskResult(predictionId);
}

/**
 * Background remover — isolates subject from background.
 * Used for auto-generated thumbnails.
 * Returns the URL of the transparent-background image.
 */
export async function submitBackgroundRemoval(
  imageUrl: string
): Promise<string> {
  const image = imageUrl.replace(/^data:image\/[^;]+;base64,/, "");
  return submitTask(
    MODELS.BG_REMOVER,
    { image },
    "generateImage"
  );
}

/** One-shot BG removal (submit + poll). Returns image URL. */
export async function removeBackground(imageUrl: string): Promise<string> {
  const predictionId = await submitBackgroundRemoval(imageUrl);
  return pollTaskResult(predictionId);
}

/**
 * Lip sync — generates a talking head video from a photo + audio.
 * Used for "talking head intro" where athlete narrates their own tape.
 */
export async function submitLipSync(
  imageUrl: string,
  audioUrl: string,
  duration: number = 5
): Promise<string> {
  const image = imageUrl.replace(/^data:image\/[^;]+;base64,/, "");
  const audio = audioUrl.replace(/^data:audio\/[^;]+;base64,/, "");
  return submitTask(MODELS.WAN_LIPSYNC, {
    image,
    audio,
    duration: Math.max(2, Math.min(10, duration)),
  });
}

/** One-shot lip sync (submit + poll). Returns video URL. */
export async function generateLipSync(
  imageUrl: string,
  audioUrl: string,
  duration: number = 5
): Promise<string> {
  const predictionId = await submitLipSync(imageUrl, audioUrl, duration);
  return pollTaskResult(predictionId);
}

/**
 * Style transfer — applies a visual style to a video via video-to-video.
 * Used as a post-processing pass on the assembled tape.
 */
export async function submitStyleTransfer(
  videoUrl: string,
  stylePrompt: string,
  strength: number = 0.5
): Promise<string> {
  return submitTask(MODELS.WAN_V2V, {
    video: videoUrl,
    prompt: stylePrompt,
    strength: Math.max(0.1, Math.min(1.0, strength)),
  });
}

/** One-shot style transfer (submit + poll). Returns styled video URL. */
export async function generateStyleTransfer(
  videoUrl: string,
  stylePrompt: string,
  strength: number = 0.5
): Promise<string> {
  const predictionId = await submitStyleTransfer(videoUrl, stylePrompt, strength);
  return pollTaskResult(predictionId);
}
