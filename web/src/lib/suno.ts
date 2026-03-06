/**
 * Suno API client for AI music generation.
 * Uses V4.5-All model via third-party API provider.
 * Server-side only — requires SUNO_API_KEY and SUNO_API_BASE_URL env vars.
 *
 * The submit/poll pattern mirrors our Kling integration (lib/kling.ts).
 */

const DEFAULT_API_BASE = "https://api.sunoapi.org";

/** How often to poll for results (ms) */
const POLL_INTERVAL_MS = 5_000;
/** Max time to wait for generation (ms) — Suno can take 2-3 min */
const POLL_TIMEOUT_MS = 300_000; // 5 minutes

export interface SunoGenerateRequest {
  /** Music description / mood prompt (non-custom mode) */
  prompt: string;
  /** Generate instrumental only (no vocals) */
  instrumental: boolean;
  /** Model version */
  model: "V4_5ALL";
  /** Optional callback URL for webhook notifications */
  callBackUrl?: string;
}

interface SunoTrackData {
  id: string;
  audioUrl: string;
  streamAudioUrl?: string;
  imageUrl?: string;
  prompt: string;
  title: string;
  tags: string;
  duration: number;
  createTime: string;
}

interface SunoGenerateResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

interface SunoTaskResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    status: "PENDING" | "TEXT_SUCCESS" | "FIRST_SUCCESS" | "SUCCESS" | "FAILED";
    response?: {
      sunoData?: SunoTrackData[];
    };
    errorMessage?: string;
  };
}

function getApiKey(): string {
  const key = process.env.SUNO_API_KEY;
  if (!key) {
    throw new Error("SUNO_API_KEY is not configured. AI music generation requires a Suno API key.");
  }
  return key;
}

function getApiBase(): string {
  return process.env.SUNO_API_BASE_URL ?? DEFAULT_API_BASE;
}

/**
 * Submit a music generation task to Suno.
 * Returns the task ID for polling.
 */
export async function submitMusicGeneration(
  prompt: string,
  instrumental: boolean = true
): Promise<string> {
  const apiKey = getApiKey();
  const apiBase = getApiBase();

  const body: SunoGenerateRequest = {
    prompt,
    instrumental,
    model: "V4_5ALL",
  };

  const response = await fetch(`${apiBase}/api/v1/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Suno API error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as SunoGenerateResponse;
  console.log(`[suno] submit response:`, JSON.stringify(data));

  if (!data?.data?.taskId) {
    throw new Error("Suno API returned no task ID");
  }

  return data.data.taskId;
}

export interface MusicPollResult {
  status: "processing" | "completed" | "failed";
  audioUrl?: string;
  title?: string;
  tags?: string;
  duration?: number;
  error?: string;
}

/**
 * Check the status of a music generation task (single request, no loop).
 * Use this from a client-side polling loop.
 */
export async function checkMusicResult(taskId: string): Promise<MusicPollResult> {
  const apiKey = getApiKey();
  const apiBase = getApiBase();

  const response = await fetch(`${apiBase}/api/v1/task/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Suno poll error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as SunoTaskResponse;
  const task = data.data;
  console.log(`[suno] task ${taskId}: status=${task.status}`);

  if (task.status === "SUCCESS") {
    const track = task.response?.sunoData?.[0];
    if (!track?.audioUrl) {
      return { status: "failed", error: "Music generated but no audio URL returned" };
    }
    return {
      status: "completed",
      audioUrl: track.audioUrl,
      title: track.title,
      tags: track.tags,
      duration: track.duration,
    };
  }

  if (task.status === "FAILED") {
    return { status: "failed", error: task.errorMessage ?? "unknown error" };
  }

  // PENDING, TEXT_SUCCESS, FIRST_SUCCESS — still processing
  return { status: "processing" };
}

/**
 * Poll for the result of a music generation task (loops until done).
 * Use for server-side contexts where long-running is OK.
 */
export async function pollMusicResult(taskId: string): Promise<MusicPollResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const result = await checkMusicResult(taskId);

    if (result.status === "completed" || result.status === "failed") {
      return result;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  return { status: "failed", error: `Music generation timed out after ${POLL_TIMEOUT_MS / 1000}s` };
}
