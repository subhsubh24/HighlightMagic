import { submitImageUpscale } from "@/lib/atlascloud";

export const runtime = "nodejs";

/** Max request body size: 20 MB (base64-encoded photos). */
const MAX_BODY_SIZE = 20 * 1024 * 1024;

/**
 * Submit an image upscale task (Atlas Cloud Image Upscaler).
 * Returns a prediction ID for polling via /api/animate/check (same poll endpoint).
 */
export async function POST(req: Request) {
  try {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return Response.json({ error: "Request body too large" }, { status: 413 });
    }

    const { imageData } = await req.json();

    if (!imageData || typeof imageData !== "string") {
      return Response.json({ error: "imageData is required" }, { status: 400 });
    }

    const predictionId = await submitImageUpscale(imageData);
    return Response.json({ predictionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upscale] Error:", message);
    return Response.json(
      { error: "Image upscale failed" },
      { status: 500 }
    );
  }
}
