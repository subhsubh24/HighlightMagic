import { submitPhotoAnimation } from "@/lib/kling";

export const runtime = "nodejs";

/** Max request body size: 20 MB (base64-encoded photos). */
const MAX_BODY_SIZE = 20 * 1024 * 1024;

/**
 * API route handler for submitting photo animations.
 *
 * Uses a route handler instead of a server action to avoid React Flight
 * serialization limits — large base64 data URIs (multi-MB photos) exceed
 * the maximum array nesting depth in React 19's Flight protocol.
 */
export async function POST(req: Request) {
  try {
    // Check Content-Length to reject oversized payloads early
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return Response.json({ error: "Request body too large" }, { status: 413 });
    }

    const { imageData, prompt, duration } = await req.json();

    if (!imageData || typeof imageData !== "string") {
      return Response.json({ error: "imageData is required" }, { status: 400 });
    }
    if (!prompt || typeof prompt !== "string") {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }

    // Validate duration is a number in acceptable range
    const dur = typeof duration === "number" ? Math.max(2, Math.min(10, duration)) : 5;

    const predictionId = await submitPhotoAnimation(imageData, prompt, dur);
    return Response.json({ predictionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[animate/submit] Error:", message);
    return Response.json({ error: "Animation submission failed" }, { status: 500 });
  }
}
