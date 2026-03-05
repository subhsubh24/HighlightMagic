import { submitPhotoAnimation } from "@/lib/kling";

export const runtime = "nodejs";

/**
 * API route handler for submitting photo animations.
 *
 * Uses a route handler instead of a server action to avoid React Flight
 * serialization limits — large base64 data URIs (multi-MB photos) exceed
 * the maximum array nesting depth in React 19's Flight protocol.
 */
export async function POST(req: Request) {
  try {
    const { imageData, prompt, duration } = await req.json();

    if (!imageData || typeof imageData !== "string") {
      return Response.json({ error: "imageData is required" }, { status: 400 });
    }
    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }

    const predictionId = await submitPhotoAnimation(imageData, prompt, duration ?? 5);
    return Response.json({ predictionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
