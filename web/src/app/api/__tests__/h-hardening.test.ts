import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { _resetBuckets } from "@/lib/rate-limit";

// Track H route-hardening: H3 error-message hygiene + H2 array bounds.

vi.mock("@/lib/kling", () => ({
  submitPhotoAnimation: vi.fn(async () => {
    throw new Error("Replicate upstream 502: secret-ish internal detail");
  }),
}));

import { POST as animateSubmitPOST } from "@/app/api/animate/submit/route";
import { POST as validatePOST } from "@/app/api/validate/route";

describe("H3 — animate/submit error hygiene", () => {
  beforeEach(() => {
    _resetBuckets();
    vi.unstubAllEnvs();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns a generic 500 and never leaks the upstream error message", async () => {
    const req = new Request("http://localhost/api/animate/submit", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.71" },
      body: JSON.stringify({ userId: "u_hyg", imageData: "data:image/png;base64,AAAA", prompt: "pan" }),
    });
    const res = await animateSubmitPOST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Animation submission failed. Please try again.");
    expect(JSON.stringify(body)).not.toMatch(/Replicate|502|secret-ish/);
  });
});

describe("H2 — validate array bounds", () => {
  beforeEach(() => {
    _resetBuckets();
    vi.unstubAllEnvs();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects > MAX_FILES sfxTracks with 400", async () => {
    const sfxTracks = Array.from({ length: 101 }, (_, i) => ({ id: `s${i}` }));
    const req = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.72" },
      body: JSON.stringify({ clips: [{ id: "c1" }], plan: {}, sfxTracks }),
    });
    const res = await validatePOST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too many sfx tracks/);
  });

  it("rejects > MAX_FILES voiceoverSegments with 400", async () => {
    const voiceoverSegments = Array.from({ length: 101 }, (_, i) => ({ id: `v${i}` }));
    const req = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.73" },
      body: JSON.stringify({ clips: [{ id: "c1" }], plan: {}, voiceoverSegments }),
    });
    const res = await validatePOST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too many voiceover segments/);
  });
});
