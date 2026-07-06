/**
 * middleware.ts tests — the two security-critical things the edge middleware does on every
 * request: the Track-H6 per-request nonce CSP, and the ROADMAP-D6 pre-launch SITE GATE
 * (HTTP Basic Auth). The gate is what keeps the unfinished web app private before launch, so
 * a regression that flipped the password check, dropped the exemptions, or opened the gate by
 * default would silently expose the product — none of that was covered before this file.
 */
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

const PASSWORD = "s3cret-launch-gate";

function req(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://highlightmagic.app${path}`, { headers });
}

function basic(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

afterEach(() => {
  delete process.env.SITE_GATE_PASSWORD;
});

describe("middleware — CSP (Track H6)", () => {
  it("attaches a nonce'd script-src CSP with no unsafe-inline on an allowed request", () => {
    delete process.env.SITE_GATE_PASSWORD; // gate off
    const res = middleware(req("/"));
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("'strict-dynamic'");
    // The whole point of the nonce is to avoid unsafe-inline on scripts.
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("generates a fresh nonce per request", () => {
    const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];
    const a = nonceOf(middleware(req("/")).headers.get("content-security-policy") ?? "");
    const b = nonceOf(middleware(req("/")).headers.get("content-security-policy") ?? "");
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });
});

describe("middleware — pre-launch site gate (ROADMAP D6)", () => {
  it("is OFF when SITE_GATE_PASSWORD is unset — the app is open", () => {
    delete process.env.SITE_GATE_PASSWORD;
    const res = middleware(req("/", { authorization: "" }));
    expect(res.status).not.toBe(401);
  });

  it("401s a non-exempt path with no Authorization header when the gate is on", () => {
    process.env.SITE_GATE_PASSWORD = PASSWORD;
    const res = middleware(req("/"));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Basic");
    // The gate still carries the CSP so the 401 page itself is protected.
    expect(res.headers.get("content-security-policy")).toContain("script-src");
  });

  it("401s a non-exempt path when the WRONG password is supplied", () => {
    process.env.SITE_GATE_PASSWORD = PASSWORD;
    const res = middleware(req("/", { authorization: basic("user", "wrong-password") }));
    expect(res.status).toBe(401);
  });

  it("ALLOWS a non-exempt path when the CORRECT password is supplied (any username)", () => {
    process.env.SITE_GATE_PASSWORD = PASSWORD;
    const res = middleware(req("/", { authorization: basic("anyone", PASSWORD) }));
    expect(res.status).not.toBe(401);
  });

  it("401s on a malformed Basic header (invalid base64) rather than throwing", () => {
    process.env.SITE_GATE_PASSWORD = PASSWORD;
    const res = middleware(req("/", { authorization: "Basic !!!not-base64!!!" }));
    expect(res.status).toBe(401);
  });

  it("401s on a non-Basic (Bearer) Authorization scheme", () => {
    process.env.SITE_GATE_PASSWORD = PASSWORD;
    const res = middleware(req("/", { authorization: `Bearer ${PASSWORD}` }));
    expect(res.status).toBe(401);
  });

  it("keeps the marketing + legal + backend surfaces PUBLIC even when the gate is on", () => {
    process.env.SITE_GATE_PASSWORD = PASSWORD;
    for (const path of ["/landing", "/privacy", "/terms", "/support", "/offline", "/api/waitlist"]) {
      const res = middleware(req(path));
      expect(res.status, `${path} must stay public`).not.toBe(401);
    }
  });

  it("gates a nested app path (prefix match is for exemptions, not a bypass)", () => {
    process.env.SITE_GATE_PASSWORD = PASSWORD;
    // A non-exempt nested route must still be gated (guards against an over-broad exemption).
    const res = middleware(req("/editor/project/123"));
    expect(res.status).toBe(401);
  });
});
