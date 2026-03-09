export const runtime = "nodejs";
export const maxDuration = 60;

/** Allowed upstream domains — only proxy from known CDN origins to prevent SSRF. */
const ALLOWED_DOMAINS = [
  "replicate.delivery",
  "pbxt.replicate.delivery",
  "api.atlascloud.ai",
  "cdn.atlascloud.ai",
  "storage.googleapis.com",
];

/** Max response size to buffer (100 MB) — prevents OOM from malicious/huge URLs. */
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024;

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

  // Domain allowlist — prevent open proxy / SSRF
  try {
    const parsed = new URL(url);
    if (!ALLOWED_DOMAINS.some((d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`))) {
      return new Response("Domain not allowed", { status: 403 });
    }
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!upstream.ok) {
      return new Response(`Upstream returned ${upstream.status}`, { status: 502 });
    }

    // Check Content-Length before buffering to avoid OOM
    const contentLength = parseInt(upstream.headers.get("content-length") ?? "", 10);
    if (contentLength > MAX_RESPONSE_BYTES) {
      return new Response("Upstream response too large", { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "video/mp4";
    // Buffer the full response to avoid streaming issues through Next.js
    const buffer = await upstream.arrayBuffer();

    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      return new Response("Upstream response too large", { status: 502 });
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[proxy-video] Fetch failed:", err);
    return new Response("Failed to fetch video", { status: 502 });
  }
}
