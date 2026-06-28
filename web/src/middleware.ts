import { NextRequest, NextResponse } from "next/server";

// PRE-LAUNCH SITE GATE (ROADMAP D6) — env-driven, OFF by default.
//
// When SITE_GATE_PASSWORD is SET, the deployed web APP (the editor at `/`) is password-protected
// (HTTP Basic Auth) so the public can't stumble onto the unfinished product before launch. The
// public MARKETING surfaces stay OPEN so people can still join the waitlist:
//   - /landing, /privacy, /terms, /support, /offline   (coming-soon + legal)
//   - /api/*  (the backend: the waitlist API + the iOS/TestFlight-facing routes, which are
//              independently protected by entitlement + rate limiting; gating them here would
//              break TestFlight, and the "half-baked app" exposure we're closing is the web UI)
//
// When SITE_GATE_PASSWORD is UNSET, the gate is OFF (launch mode) — everything is open.
// The password VALUE is human-applied via env (PENDING_OPS), NEVER committed. Unset it at launch.

const EXEMPT_PREFIXES = ["/landing", "/privacy", "/terms", "/support", "/offline", "/api/"];

function isExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const password = process.env.SITE_GATE_PASSWORD;
  if (!password) return NextResponse.next(); // gate OFF (launch / not configured)

  const { pathname } = req.nextUrl;
  if (isExempt(pathname)) return NextResponse.next(); // marketing / legal / backend stay public

  const header = req.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6)); // "user:pass" (any username; we check the password)
      const sep = decoded.indexOf(":");
      const provided = sep >= 0 ? decoded.slice(sep + 1) : decoded;
      if (provided === password) return NextResponse.next();
    } catch {
      // malformed header → fall through to 401
    }
  }

  return new NextResponse("This app is not yet open. Join the waitlist at /landing.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="HighlightMagic (pre-launch)", charset="UTF-8"' },
  });
}

export const config = {
  // Run on all routes EXCEPT Next internals + common static files; route-level exemptions are
  // handled in middleware() above so the marketing surfaces stay public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js|icons/|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|mp4|webmanifest)$).*)"],
};
