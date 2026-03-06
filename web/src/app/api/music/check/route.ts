import { checkMusicResult } from "@/lib/suno";

export const runtime = "nodejs";

/** Only allow alphanumeric, hyphens, and underscores in task IDs. */
const TASK_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * API route handler for checking AI music generation status.
 * Companion to /api/music/submit — mirrors /api/animate/check pattern.
 */
export async function POST(req: Request) {
  try {
    const { taskId } = await req.json();

    if (!taskId || typeof taskId !== "string") {
      return Response.json({ error: "taskId is required" }, { status: 400 });
    }

    if (!TASK_ID_PATTERN.test(taskId)) {
      return Response.json({ error: "Invalid taskId format" }, { status: 400 });
    }

    const result = await checkMusicResult(taskId);
    console.log(`[music/check] taskId=${taskId} → status=${result.status}${result.audioUrl ? ` audioUrl=${result.audioUrl}` : ""}${result.error ? ` error=${result.error}` : ""}`);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[music/check] Error:", message);
    return Response.json({ error: "Music check failed" }, { status: 500 });
  }
}
