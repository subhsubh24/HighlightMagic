import { isolateInstrumental } from "@/lib/elevenlabs-stems";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Separate music into stems (instrumental isolation).
 * Accepts JSON: {musicDataUri: "data:audio/mpeg;base64,..."}
 * Returns {instrumentalUrl} — the instrumental-only track for ducking under voiceover.
 */
export async function POST(req: Request) {
  try {
    const { musicDataUri } = await req.json();

    if (!musicDataUri || typeof musicDataUri !== "string") {
      return Response.json({ error: "musicDataUri is required" }, { status: 400 });
    }

    const result = await isolateInstrumental(musicDataUri);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stems] Error:", message);
    return Response.json(
      { status: "failed", error: "Stem separation failed" },
      { status: 500 }
    );
  }
}
