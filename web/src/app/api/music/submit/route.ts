import { submitMusicGeneration } from "@/lib/suno";

export const runtime = "nodejs";

/**
 * API route handler for submitting AI music generation (Suno V4.5-All).
 * Mirrors /api/animate/submit pattern.
 */
export async function POST(req: Request) {
  try {
    const { prompt, instrumental } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }
    if (prompt.length > 500) {
      return Response.json({ error: "prompt must be 500 characters or fewer" }, { status: 400 });
    }

    const taskId = await submitMusicGeneration(prompt, instrumental !== false);
    return Response.json({ taskId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[music/submit] Error:", message);
    return Response.json({ error: "Music generation submission failed" }, { status: 500 });
  }
}
