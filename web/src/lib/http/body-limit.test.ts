import { describe, it, expect } from "vitest";
import { enforceBodyLimit, JSON_BODY_LIMIT_BYTES, VISION_BODY_LIMIT_BYTES, PLANNER_BODY_LIMIT_BYTES } from "./body-limit";
import { MAX_PLANNER_FRAMES } from "@/lib/constants";

// Generous upper bound for one downscaled JPEG frame's base64 (480p / 512² @ q0.6).
// The body caps are sized so no route ever 413s a body its own post-parse frame-count
// check would accept; these tests assert that against each route's REAL frame ceiling.
const MAX_FRAME_BYTES_REALISTIC = 160 * 1024;

function reqWith(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/x", { method: "POST", headers });
}

describe("enforceBodyLimit (Track H pre-parse body guard)", () => {
  it("rejects a declared body over the cap with a 413", () => {
    const res = enforceBodyLimit(reqWith({ "content-length": String(JSON_BODY_LIMIT_BYTES + 1) }), JSON_BODY_LIMIT_BYTES);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(413);
  });

  it("allows a declared body at exactly the cap (no off-by-one rejection)", () => {
    expect(enforceBodyLimit(reqWith({ "content-length": String(JSON_BODY_LIMIT_BYTES) }), JSON_BODY_LIMIT_BYTES)).toBeNull();
  });

  it("allows a small legitimate body", () => {
    expect(enforceBodyLimit(reqWith({ "content-length": "4096" }), JSON_BODY_LIMIT_BYTES)).toBeNull();
  });

  it("does NOT false-reject when Content-Length is absent (chunked transfer sends none)", () => {
    // A missing length must fall through — the per-field caps after parse are authoritative.
    expect(enforceBodyLimit(reqWith({}), JSON_BODY_LIMIT_BYTES)).toBeNull();
  });

  it("does NOT reject on a non-numeric Content-Length (NaN must not compare > cap)", () => {
    expect(enforceBodyLimit(reqWith({ "content-length": "" }), JSON_BODY_LIMIT_BYTES)).toBeNull();
    expect(enforceBodyLimit(reqWith({ "content-length": "not-a-number" }), JSON_BODY_LIMIT_BYTES)).toBeNull();
  });

  it("leaks nothing beyond a generic message (Track H3 error hygiene)", async () => {
    const res = enforceBodyLimit(reqWith({ "content-length": String(JSON_BODY_LIMIT_BYTES + 1) }), JSON_BODY_LIMIT_BYTES);
    const body = await res!.json();
    expect(body).toEqual({ error: "Request body too large." });
  });

  it("VISION_BODY_LIMIT_BYTES clears the worst-case legit vision body (1000 frames) yet still bounds the parse-bomb", () => {
    // score/ios-score reject frames.length > 1000, so the largest legit body is 1000 frames.
    const worstCaseLegitBytes = 1000 * MAX_FRAME_BYTES_REALISTIC; // ~160MB
    expect(VISION_BODY_LIMIT_BYTES).toBeGreaterThan(worstCaseLegitBytes);
    expect(enforceBodyLimit(reqWith({ "content-length": String(worstCaseLegitBytes) }), VISION_BODY_LIMIT_BYTES)).toBeNull();
    // A body an order of magnitude over the legit ceiling is still rejected pre-parse.
    const bomb = enforceBodyLimit(reqWith({ "content-length": String(2 * 1024 * 1024 * 1024) }), VISION_BODY_LIMIT_BYTES);
    expect(bomb!.status).toBe(413);
  });

  it("PLANNER_BODY_LIMIT_BYTES clears the worst-case legit planner body (MAX_PLANNER_FRAMES frames) — never 413s a valid full-size project", () => {
    // plan/ios-plan accept up to MAX_PLANNER_FRAMES (12,000) frames, far more than the vision
    // routes — so the cap must clear that real ceiling, not the 1000-frame vision ceiling.
    const worstCaseLegitBytes = MAX_PLANNER_FRAMES * MAX_FRAME_BYTES_REALISTIC; // ~1.9GB
    expect(PLANNER_BODY_LIMIT_BYTES).toBeGreaterThan(worstCaseLegitBytes);
    expect(enforceBodyLimit(reqWith({ "content-length": String(worstCaseLegitBytes) }), PLANNER_BODY_LIMIT_BYTES)).toBeNull();
    // Crucially, the 300MB vision cap would WRONGLY reject that same legit planner body —
    // this is exactly why plan/ios-plan need the larger cap.
    expect(enforceBodyLimit(reqWith({ "content-length": String(worstCaseLegitBytes) }), VISION_BODY_LIMIT_BYTES)!.status).toBe(413);
    // The per-field theoretical (12,000 × 12M chars ≈ 144GB) is still bounded.
    const bomb = enforceBodyLimit(reqWith({ "content-length": String(100 * 1024 * 1024 * 1024) }), PLANNER_BODY_LIMIT_BYTES);
    expect(bomb!.status).toBe(413);
  });
});
