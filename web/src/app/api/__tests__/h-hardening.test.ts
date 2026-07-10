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
import { POST as iosValidatePOST } from "@/app/api/ios-validate/route";
import { MAX_DIRECTION_CHARS, MAX_PROMPT_CHARS, MAX_TRANSCRIPT_CHARS } from "@/lib/input-bounds";

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

  it("rejects > MAX_FILES sourceFiles with 400", async () => {
    const sourceFiles = Array.from({ length: 101 }, (_, i) => ({ name: `f${i}`, type: "mp4", duration: 1 }));
    const req = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.74" },
      body: JSON.stringify({ clips: [{ id: "c1" }], plan: {}, sourceFiles }),
    });
    const res = await validatePOST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too many source files/);
  });
});

// H2 — the free-text fields serialized into the paid Haiku prompt must be length-bounded
// server-side BEFORE the paid call (a crafted multi-MB string is a token-cost wallet drain).
// Each case sends an over-limit string and asserts the generic 413 (no field name leaked, H3).
describe("H2 — validate free-text prompt bounds (413)", () => {
  beforeEach(() => {
    _resetBuckets();
    vi.unstubAllEnvs();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });
  afterEach(() => vi.unstubAllEnvs());

  function post(extra: Record<string, unknown>, ip: string) {
    return validatePOST(
      new Request("http://localhost/api/validate", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ clips: [{ id: "c1" }], plan: {}, ...extra }),
      }),
    );
  }

  it("rejects an oversized contentSummary with 413", async () => {
    const res = await post({ contentSummary: "x".repeat(MAX_DIRECTION_CHARS + 1) }, "203.0.113.80");
    expect(res.status).toBe(413);
  });

  it("rejects an oversized audioTranscript with 413", async () => {
    const res = await post({ audioTranscript: "x".repeat(MAX_TRANSCRIPT_CHARS + 1) }, "203.0.113.81");
    expect(res.status).toBe(413);
  });

  it("rejects an oversized introCard.text with 413", async () => {
    const res = await post({ introCard: { text: "x".repeat(MAX_PROMPT_CHARS + 1), stylePrompt: "" } }, "203.0.113.82");
    expect(res.status).toBe(413);
  });

  it("rejects an oversized sfxTracks[].prompt with 413", async () => {
    const res = await post({ sfxTracks: [{ clipIndex: 0, prompt: "x".repeat(MAX_PROMPT_CHARS + 1) }] }, "203.0.113.83");
    expect(res.status).toBe(413);
  });

  it("accepts a transcript at the limit (boundary, not over) — reaches the paid path", async () => {
    // At exactly the cap the bound must NOT fire; with no userId the request proceeds to the
    // (stubbed) provider path. We only assert it is NOT a 413/400 size rejection.
    const res = await post({ audioTranscript: "x".repeat(MAX_TRANSCRIPT_CHARS) }, "203.0.113.84");
    expect(res.status).not.toBe(413);
    expect(res.status).not.toBe(400);
  });
});

describe("H2 — ios-validate free-text prompt bounds (413)", () => {
  const clip = { captionText: "hi", durationSec: 3, filter: "none", transition: "default", order: 0 };
  beforeEach(() => {
    _resetBuckets();
    vi.unstubAllEnvs();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });
  afterEach(() => vi.unstubAllEnvs());

  function post(extra: Record<string, unknown>, ip: string) {
    return iosValidatePOST(
      new Request("http://localhost/api/ios-validate", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ userId: "u", clips: [clip], ...extra }),
      }),
    );
  }

  it("rejects an oversized contentSummary with 413", async () => {
    const res = await post({ contentSummary: "x".repeat(MAX_DIRECTION_CHARS + 1) }, "203.0.113.90");
    expect(res.status).toBe(413);
  });

  it("rejects an oversized musicPrompt with 413", async () => {
    const res = await post({ musicPrompt: "x".repeat(MAX_PROMPT_CHARS + 1) }, "203.0.113.91");
    expect(res.status).toBe(413);
  });

  it("rejects an oversized voiceover segment text with 413", async () => {
    const res = await post(
      { voiceover: { enabled: true, segments: [{ clipIndex: 0, text: "x".repeat(MAX_PROMPT_CHARS + 1) }] } },
      "203.0.113.92",
    );
    expect(res.status).toBe(413);
  });
});
