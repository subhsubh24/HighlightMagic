import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIP, PUBLIC_RATE_LIMIT } from "@/lib/rate-limit";

// Waitlist submission handler.
// Owner action: connect a real email provider (Resend, Mailchimp, ConvertKit, etc.)
// by replacing the console.log below with the provider SDK call.
// All submissions are logged to Vercel function logs in the meantime.

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

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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

    // TODO (owner): replace this log with a real email provider call, e.g.
    //   await resend.contacts.create({ email, audienceId: process.env.RESEND_AUDIENCE_ID });
    console.log(`[waitlist] ${new Date().toISOString()} ${email}`);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 });
  }
}
