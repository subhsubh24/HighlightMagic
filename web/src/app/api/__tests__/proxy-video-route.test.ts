/**
 * /api/proxy-video route tests — the same-origin video proxy. This endpoint takes a
 * client-supplied URL, so its SSRF defenses (HTTPS-only + domain allowlist + size cap) are
 * security-critical and must not regress.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/proxy-video/route";
import { _resetBuckets, POLL_RATE_LIMIT } from "@/lib/rate-limit";

function get(url: string | null, ip = "1.2.3.4"): Request {
  const u = url === null ? "http://localhost/api/proxy-video" : `http://localhost/api/proxy-video?url=${encodeURIComponent(url)}`;
  return new Request(u, { headers: { "x-forwarded-for": ip } });
}

beforeEach(() => _resetBuckets());
afterEach(() => vi.restoreAllMocks());

describe("GET /api/proxy-video", () => {
  it("400s when url is missing", async () => {
    const res = await GET(get(null));
    expect(res.status).toBe(400);
  });

  it("400s on a non-HTTPS url (SSRF guard)", async () => {
    const res = await GET(get("http://replicate.delivery/x.mp4"));
    expect(res.status).toBe(400);
  });

  it("403s on a domain not in the allowlist (open-proxy guard)", async () => {
    const res = await GET(get("https://evil.example.com/x.mp4"));
    expect(res.status).toBe(403);
  });

  it("403s on a lookalike that only contains an allowed domain as a substring", async () => {
    // hostname endsWith check must not be fooled by "replicate.delivery.evil.com"
    const res = await GET(get("https://replicate.delivery.evil.com/x.mp4"));
    expect(res.status).toBe(403);
  });

  it("allows an exact allowlisted host and proxies the bytes through", async () => {
    const body = new Uint8Array([1, 2, 3, 4]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": String(body.byteLength) },
      }),
    );
    const res = await GET(get("https://replicate.delivery/out.mp4"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(body);
  });

  it("allows a subdomain of an allowlisted host via the endsWith branch", async () => {
    // klingai.com is allowlisted but `video.klingai.com` is not an exact entry, so this
    // exercises the `hostname.endsWith(".klingai.com")` path (not the exact-match path).
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([9]), { status: 200, headers: { "content-type": "video/mp4" } }),
    );
    const res = await GET(get("https://video.klingai.com/out.mp4"));
    expect(res.status).toBe(200);
  });

  it("502s when the upstream returns an error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 404 }));
    const res = await GET(get("https://replicate.delivery/missing.mp4"));
    expect(res.status).toBe(502);
  });

  it("502s when the upstream advertises a too-large content-length (OOM guard)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": String(200 * 1024 * 1024) },
      }),
    );
    const res = await GET(get("https://replicate.delivery/huge.mp4"));
    expect(res.status).toBe(502);
  });

  it("502s when the upstream fetch throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const res = await GET(get("https://replicate.delivery/x.mp4"));
    expect(res.status).toBe(502);
  });

  it("429s once the per-IP rate limit is exceeded (Track H1 — bandwidth/egress drain guard)", async () => {
    // A validation error (missing url) is enough to prove the limiter runs BEFORE any work —
    // no upstream fetch needed, and it isolates the throttle from the SSRF/size paths.
    for (let i = 0; i < POLL_RATE_LIMIT.limit; i++) {
      const ok = await GET(get(null, "9.9.9.9"));
      expect(ok.status).toBe(400); // allowed through to the url-missing check
    }
    const blocked = await GET(get(null, "9.9.9.9"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("throttles per-IP, so a different client is unaffected by another's flood", async () => {
    for (let i = 0; i < POLL_RATE_LIMIT.limit; i++) await GET(get(null, "8.8.8.8"));
    expect((await GET(get(null, "8.8.8.8"))).status).toBe(429);
    // A separate IP still gets through.
    expect((await GET(get(null, "7.7.7.7"))).status).toBe(400);
  });
});
