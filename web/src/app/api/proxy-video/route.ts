export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Proxy a remote video URL through the Next.js server so the browser receives
 * it as same-origin. This prevents canvas tainting when the video is drawn
 * via drawImage() during client-side export rendering.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return new Response("Missing url parameter", { status: 400 });
  }

  // Only allow HTTPS URLs to prevent SSRF against internal services
  if (!url.startsWith("https://")) {
    return new Response("Only HTTPS URLs are allowed", { status: 400 });
  }

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return new Response(`Upstream returned ${upstream.status}`, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "video/mp4";
    const body = upstream.body;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[proxy-video] Fetch failed:", err);
    return new Response("Failed to fetch video", { status: 502 });
  }
}
