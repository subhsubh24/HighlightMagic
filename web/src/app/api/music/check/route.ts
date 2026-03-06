export const runtime = "nodejs";

/**
 * DEPRECATED: The check endpoint is no longer needed.
 * ElevenLabs music generation is synchronous — results are returned
 * directly from /api/music/submit.
 *
 * This route remains to avoid 404s from any in-flight polling requests
 * during the transition.
 */
export async function POST() {
  return Response.json(
    { status: "completed", message: "Polling is no longer needed. Use /api/music/submit which returns results directly." },
    { status: 200 }
  );
}
