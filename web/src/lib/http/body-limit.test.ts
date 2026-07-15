import { describe, it, expect } from "vitest";
import { enforceBodyLimit, JSON_BODY_LIMIT_BYTES } from "./body-limit";

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
});
