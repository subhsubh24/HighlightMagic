import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIP, PUBLIC_RATE_LIMIT } from "@/lib/rate-limit";
import { addPendingSignup } from "@/lib/growth/waitlist-store";
import { sendEmail, buildConfirmationEmail } from "@/lib/email";

export const runtime = "nodejs";

// E6a — Waitlist capture with double-opt-in.
// Persists each signup to the datastore (Vercel KV when configured; in-memory otherwise),
// then emails a confirmation link. DRY-RUN SAFE: with no KV/email creds the signup is kept
// in-process and the confirmation email is a logged no-op — the form still works and returns
// { ok: true }. Owner connects Resend + Vercel KV per docs/growth/CONNECT.md to go live.

// SECURITY: build the confirmation link from a TRUSTED base only. Never trust the client
// `Origin` header (attacker-controllable → would put a malicious confirm link in the email,
// letting the attacker consume the single-use token). Use the configured app URL, else the
// Vercel-controlled Host, else the hardcoded canonical domain.
function baseUrl(req: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const host = req.headers.get("host");
  return host ? `https://${host}` : "https://highlightmagic.app";
}

export async function POST(req: NextRequest) {
  // Track H1: rate limit — protect against bot floods
  const ip = getClientIP(req);
  const rl = checkRateLimit(`waitlist:${ip}`, PUBLIC_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, rl.resetAt - Math.floor(Date.now() / 1000))) } }
    );
  }

  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    // Track H5: Turnstile CAPTCHA verification (when TURNSTILE_SECRET_KEY is configured)
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      const token = typeof body.cfTurnstileToken === "string" ? body.cfTurnstileToken : null;
      if (!token) {
        return NextResponse.json({ error: "CAPTCHA required." }, { status: 400 });
      }
      try {
        const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret: turnstileSecret, response: token }),
        });
        const verifyData = await verifyRes.json() as { success: boolean };
        if (!verifyData.success) {
          return NextResponse.json({ error: "CAPTCHA verification failed. Please try again." }, { status: 400 });
        }
      } catch {
        // Fail-open: if Turnstile is unreachable, allow through
      }
    }

    // E6a: persist as pending + send double-opt-in confirmation (both dry-run safe).
    const confirmToken = await addPendingSignup(email);
    const confirmUrl = `${baseUrl(req)}/api/waitlist/confirm?token=${confirmToken}`;
    const { subject, text } = buildConfirmationEmail(confirmUrl);
    // Awaited so serverless doesn't kill the request early; sendEmail never throws and
    // fails-open in dry-run.
    await sendEmail({ to: email, subject, text });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 });
  }
}
