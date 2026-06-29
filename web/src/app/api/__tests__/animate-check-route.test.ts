/**
 * /api/animate/check route tests — polls a paid photo-animation job's status. Companion to
 * /api/animate/submit; covers input sanitisation (predictionId format), the outputUrl→videoUrl
 * mapping the client depends on, and error hygiene.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/kling", () => ({ checkAnimationResult: vi.fn() }));
import { checkAnimationResult } from "@/lib/kling";
import { POST } from "@/app/api/animate/check/route";
import { _resetBuckets, POLL_RATE_LIMIT } from "@/lib/rate-limit";

const mockCheck = vi.mocked(checkAnimationResult);

function req(body: unknown, ip?: string): Request {
  return new Request("http://localhost/api/animate/check", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(ip ? { "x-forwarded-for": ip } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => _resetBuckets());
afterEach(() => vi.clearAllMocks());

describe("POST /api/animate/check", () => {
  it("400s when predictionId is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("400s on a predictionId with illegal characters (path-injection guard)", async () => {
    const res = await POST(req({ predictionId: "../../etc/passwd" }));
    expect(res.status).toBe(400);
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("maps outputUrl → videoUrl on a completed job", async () => {
    mockCheck.mockResolvedValue({ status: "completed", outputUrl: "https://cdn/x.mp4" });
    const res = await POST(req({ predictionId: "abc-123_XYZ" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "completed", videoUrl: "https://cdn/x.mp4", error: undefined });
  });

  it("passes through a processing status with no url yet", async () => {
    mockCheck.mockResolvedValue({ status: "processing" });
    const res = await POST(req({ predictionId: "abc123" }));
    const body = await res.json();
    expect(body.status).toBe("processing");
    // No url yet: the key is omitted from the serialized payload (not null).
    expect("videoUrl" in body).toBe(false);
  });

  it("500s with a generic message when the upstream check throws (error hygiene)", async () => {
    mockCheck.mockRejectedValue(new Error("kling 503 internal queue detail"));
    const res = await POST(req({ predictionId: "abc123" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Animation check failed");
    expect(JSON.stringify(body)).not.toContain("queue");
  });

  it("rate-limits per IP after POLL_RATE_LIMIT, without hitting the provider on the blocked call", async () => {
    mockCheck.mockResolvedValue({ status: "processing" });
    const ip = "203.0.113.7";
    // Exhaust the generous poll budget — all allowed.
    for (let i = 0; i < POLL_RATE_LIMIT.limit; i++) {
      const res = await POST(req({ predictionId: "abc123" }, ip));
      expect(res.status).toBe(200);
    }
    // The next call from the same IP is throttled BEFORE the provider is queried.
    const callsBefore = mockCheck.mock.calls.length;
    const blocked = await POST(req({ predictionId: "abc123" }, ip));
    expect(blocked.status).toBe(429);
    expect(mockCheck.mock.calls.length).toBe(callsBefore);
    // A different IP is unaffected (per-IP bucketing).
    const other = await POST(req({ predictionId: "abc123" }, "198.51.100.4"));
    expect(other.status).toBe(200);
  });
});
