import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIP, PUBLIC_RATE_LIMIT } from "@/lib/rate-limit";
import { addPendingSignup, addConfirmedSignup } from "@/lib/growth/waitlist-store";
import { sendEmail, buildConfirmationEmail, isEmailConfigured } from "@/lib/email";

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

    // DECISION COROLLARY (FACTORY_STANDARD §6): do NOT gate "on the list" on a confirmation email
    // when that loop isn't wired. Use double-opt-in ONLY when a real provider is configured (the loop
    // exists + is round-trip-tested per G7); otherwise record the signup as CONFIRMED directly so a
    // new signup is never dead-ended waiting on an email that never sends.
    if (isEmailConfigured()) {
      const confirmToken = await addPendingSignup(email);
      const confirmUrl = `${baseUrl(req)}/api/waitlist/confirm?token=${confirmToken}`;
      const { subject, text } = buildConfirmationEmail(confirmUrl);
      // SIDE-EFFECT INTEGRITY: the success we report must be causally downstream of the email actually
      // leaving the system. sendEmail never throws; it returns { ok, dryRun }.
      const sendResult = await sendEmail({ to: email, subject, text });
      // NO FAKE SUCCESS: a configured provider that fails to send must NOT report success — that would
      // dead-end the user (told to check an email that never arrives). Fail honestly so they can retry.
      if (!sendResult.ok) {
        return NextResponse.json(
          { error: "We couldn't send your confirmation email. Please try again in a moment." },
          { status: 502 }
        );
      }
      return NextResponse.json({ ok: true, confirmationEmailSent: true });
    }

    // Email loop NOT wired (no provider): no gate on an unbuilt send — the signup goes straight onto
    // the list. The UI shows an honest "You're on the list!" (it does NOT claim an email was sent).
    await addConfirmedSignup(email);
    return NextResponse.json({ ok: true, confirmationEmailSent: false });
  } catch {
    return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 });
  }
}
