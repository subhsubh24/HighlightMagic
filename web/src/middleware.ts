import { NextRequest, NextResponse } from "next/server";

// This middleware does two things on every document request:
//   1. Track H6 — attaches a per-request, nonce-based Content-Security-Policy.
//   2. ROADMAP D6 — the env-driven PRE-LAUNCH SITE GATE (OFF by default).
//
// ── Track H6: Content-Security-Policy with a per-request nonce ──
// The other security headers (HSTS, X-Frame-Options, X-Content-Type-Options, CORS, …) are
// static and live in next.config.ts. CSP lives HERE because a strong policy needs a
// per-request nonce, which only middleware can generate.
//
// Why a nonce: Next.js (App Router) emits inline bootstrap/hydration <script> tags, so a
// strict `script-src` would need either `'unsafe-inline'` (which defeats the whole purpose)
// or a per-request nonce. We generate the nonce here; Next.js automatically stamps it onto
// its own scripts when it finds a nonce in the request's `Content-Security-Policy` header.
// `'strict-dynamic'` then lets those trusted (nonce'd) scripts load their own chunks without
// host-allowlisting, and modern browsers IGNORE the `https:`/`'self'` script fallbacks in its
// presence — those exist only for older browsers that don't understand `'strict-dynamic'`.
// This is the official Next.js CSP recipe.
//
// Non-script directives intentionally allow `https:` (plus blob:/data:) for connect/img/media:
// the editor fetches generated assets (video/audio thumbnails, music tracks) from provider
// CDNs in the browser, so a `'self'`-only connect/media policy would silently break export.
// The meaningful XSS control is the nonce-gated `script-src` with NO `'unsafe-inline'`;
// `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, and `frame-ancestors 'none'`
// close the remaining high-value vectors.
//
// ── ROADMAP D6: PRE-LAUNCH SITE GATE (env-driven, OFF by default) ──
// When SITE_GATE_PASSWORD is SET, the deployed web APP (the editor at `/`) is password-protected
// (HTTP Basic Auth) so the public can't stumble onto the unfinished product before launch. The
// public MARKETING surfaces stay OPEN so people can still join the waitlist:
//   - /landing, /privacy, /terms, /support, /offline   (coming-soon + legal)
//   - /api/*  (the backend: the waitlist API + the iOS/TestFlight-facing routes, which are
//              independently protected by entitlement + rate limiting; gating them here would
//              break TestFlight, and the "half-baked app" exposure we're closing is the web UI)
// When SITE_GATE_PASSWORD is UNSET, the gate is OFF (launch mode) — everything is open.
// The password VALUE is human-applied via env (PENDING_OPS), NEVER committed. Unset it at launch.

const EXEMPT_PREFIXES = ["/landing", "/privacy", "/terms", "/support", "/offline", "/api/"];

function isExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

function buildCsp(nonce: string): string {
  return [
    `default-src 'self'`,
    // nonce + strict-dynamic is the real script lock; https:/'self' are older-browser fallbacks
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:`,
    // React/Next inject inline style attributes; style injection is far lower-risk than script
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https:`,
    `media-src 'self' blob: data: https:`,
    `font-src 'self' data:`,
    // browser fetches /api/* (self) + provider asset CDNs (https) during export
    `connect-src 'self' https:`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    // Track H5: the Cloudflare Turnstile CAPTCHA renders its challenge in an iframe from
    // challenges.cloudflare.com. With no frame-src this falls back to default-src 'self' and the
    // widget is blocked — so allow exactly that origin (and self), nothing wider.
    `frame-src 'self' https://challenges.cloudflare.com`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Next.js extracts the nonce from THIS request header and stamps it onto its own bootstrap
  // scripts. (The root layout separately calls headers() to opt rendering into per-request/
  // dynamic mode — required so a per-request nonce exists at render time; statically-
  // prerendered HTML has no per-request nonce and its scripts would be CSP-blocked.)
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("content-security-policy", csp);

  // A NextResponse.next() that forwards the nonce request header AND carries the CSP response
  // header. Used for every "allow" path so CSP is present regardless of the site-gate outcome.
  const allow = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("content-security-policy", csp);
    return res;
  };

  const password = process.env.SITE_GATE_PASSWORD;
  if (!password) return allow(); // gate OFF (launch / not configured)

  const { pathname } = req.nextUrl;
  if (isExempt(pathname)) return allow(); // marketing / legal / backend stay public

  const header = req.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6)); // "user:pass" (any username; we check the password)
      const sep = decoded.indexOf(":");
      const provided = sep >= 0 ? decoded.slice(sep + 1) : decoded;
      if (provided === password) return allow();
    } catch {
      // malformed header → fall through to 401
    }
  }

  return new NextResponse("This app is not yet open. Join the waitlist at /landing.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="HighlightMagic (pre-launch)", charset="UTF-8"',
      "content-security-policy": csp,
    },
  });
}

export const config = {
  // Run on all routes EXCEPT Next internals + common static files; route-level exemptions are
  // handled in middleware() above so the marketing surfaces stay public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js|icons/|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|mp4|webmanifest)$).*)"],
};
