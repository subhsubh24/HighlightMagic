import {
  checkRateLimit,
  getClientIP,
  rateLimitResponse,
  POLL_RATE_LIMIT,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Allowed upstream domains — only proxy from known CDN origins to prevent SSRF. */
const ALLOWED_DOMAINS = [
  "replicate.delivery",
  "pbxt.replicate.delivery",
  "api.atlascloud.ai",
  "cdn.atlascloud.ai",
  "storage.googleapis.com",
  // Atlas Cloud Wan 2.6 T2V outputs (Alibaba OSS — multiple regions & accelerate endpoint)
  "dashscope-463f.oss-ap-southeast-1.aliyuncs.com",
  "dashscope-463f.oss-accelerate.aliyuncs.com",
  // Atlas Cloud Kling i2v outputs
  "klingai.com",
];

/** Max response size to buffer (100 MB) — prevents OOM from malicious/huge URLs. */
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024;

/**
 * Per-chunk stall guard (ms). The initial `fetch` carries a 30 s connect/header timeout, but once
 * headers arrive that AbortSignal is satisfied and the body read loop below is unbounded: an
 * upstream CDN that sends headers then hangs mid-body would leave `reader.read()` blocked until
 * Vercel kills the function at `maxDuration` (60 s), holding the slot the whole time and returning
 * an opaque platform error instead of a clean 502. Bounding each read keeps a stalled stream from
 * occupying the function to the wall-clock limit — the same stall-guard discipline used for the SSE
 * planner (per-chunk STREAM_READ_TIMEOUT_MS) and the B6 fetch timeouts on every other external call.
 */
const STREAM_STALL_TIMEOUT_MS = 20_000;

/**
 * Read the next chunk, but reject if no chunk (or stream end) arrives within `timeoutMs`. On a
 * healthy stream this resolves the instant the chunk lands; the timer only fires when the upstream
 * goes silent mid-body. The timer is always cleared so a completed read never leaves it pending.
 */
async function readChunkWithStallGuard(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("proxy-video: upstream stalled mid-stream")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Proxy a remote video URL through the Next.js server so the browser receives
 * it as same-origin. This prevents canvas tainting when the video is drawn
 * via drawImage() during client-side export rendering.
 */
export async function GET(req: Request) {
  // Track H1: this is a PUBLIC, unauthenticated GET that buffers up to 100 MB of upstream
  // bytes per request in the serverless function — an unthrottled flood is a bandwidth/egress
  // + memory drain. Throttle per-IP (GET amplification tier, not the tight PAID tier) so a
  // legitimate export (a handful of proxied clips) never trips while a flood is bounded.
  const rl = checkRateLimit(`proxy-video:${getClientIP(req)}`, POLL_RATE_LIMIT);
  if (!rl.allowed) return rateLimitResponse(rl);

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

    // Fast-path reject when the upstream DECLARES a size over the cap.
    const declaredLength = parseInt(upstream.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      return new Response("Upstream response too large", { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "video/mp4";

    // Enforce the cap on the ACTUAL bytes, not just the declared Content-Length. A chunked
    // response omits Content-Length, so `parseInt("")` is NaN and the declared-size guard above
    // silently passes it — reading such a body via arrayBuffer() would buffer unbounded and OOM
    // the function. Stream with a running total so memory is bounded to ~MAX_RESPONSE_BYTES even
    // when the upstream lies about (or omits) its size. Still fully buffered before responding to
    // avoid streaming issues through Next.js.
    if (!upstream.body) {
      return new Response("Upstream response had no body", { status: 502 });
    }
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await readChunkWithStallGuard(reader, STREAM_STALL_TIMEOUT_MS);
      } catch (stallErr) {
        // Stalled (or errored) mid-body — release the socket promptly and fail fast+clean rather
        // than let the read hang to the maxDuration kill.
        await reader.cancel().catch(() => {});
        throw stallErr;
      }
      const { done, value } = result;
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return new Response("Upstream response too large", { status: 502 });
      }
      chunks.push(value);
    }

    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(total),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[proxy-video] Fetch failed:", err);
    return new Response("Failed to fetch video", { status: 502 });
  }
}
