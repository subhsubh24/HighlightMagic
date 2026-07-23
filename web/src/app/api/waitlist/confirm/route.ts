import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIP, PUBLIC_RATE_LIMIT } from "@/lib/rate-limit";
import { confirmSignup } from "@/lib/growth/waitlist-store";
import { sendEmail, buildWelcomeEmail } from "@/lib/email";

// E6a — Double-opt-in confirmation endpoint.
// The recipient clicks the link from the confirmation email; this marks their email
// confirmed and sends a welcome email. Idempotent and DRY-RUN SAFE. Returns a tiny HTML
// page so the click lands on something human (not raw JSON). Track H1 rate-limited; emits
// only generic messages (Track H3 — no token/email enumeration).

export const runtime = "nodejs";
// KV read + a welcome-email send (email client has its own 10s timeout). An explicit budget
// keeps the confirm click from being killed at the short platform default mid-send.
export const maxDuration = 30;

function page(title: string, body: string, status: number): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${title}</title>` +
    `<style>body{margin:0;min-height:100vh;display:grid;place-items:center;` +
    `font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0b0f;color:#f5f5f7}` +
    `.card{max-width:420px;padding:40px 28px;text-align:center}` +
    `h1{font-size:22px;margin:0 0 12px;letter-spacing:-0.01em}` +
    `p{font-size:15px;line-height:1.5;color:#a1a1aa;margin:0}` +
    `a{color:#c084fc;text-decoration:none}</style></head>` +
    `<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest) {
  const ip = getClientIP(req);
  const rl = checkRateLimit(`waitlist-confirm:${ip}`, PUBLIC_RATE_LIMIT);
  if (!rl.allowed) {
    return page("Slow down", "Too many attempts. Please try again in a minute.", 429);
  }

  const token = req.nextUrl.searchParams.get("token") ?? "";
  let email: string | null;
  try {
    email = await confirmSignup(token);
  } catch {
    // A KV backend error (now bounded by a fast timeout in confirmSignup) must land on a branded,
    // human page — not Next.js's default error handler. Generic copy, no token/email leak (Track H3).
    return page(
      "Something went wrong",
      "We couldn't confirm your email just now. Please click the link again in a moment.",
      503
    );
  }
  if (!email) {
    // Generic — never reveal whether the token existed (anti-enumeration).
    return page(
      "Link expired",
      "This confirmation link is invalid or has expired. You can rejoin the waitlist anytime.",
      400
    );
  }

  // Welcome email is dry-run safe and best-effort; a send failure must not break confirmation.
  // But it MUST be observable — a silent failure behind a "you're on the list" page leaves the
  // user waiting on an email that never arrives with zero server-side signal to diagnose it.
  const { subject, text } = buildWelcomeEmail();
  const welcome = await sendEmail({ to: email, subject, text });
  if (!welcome.ok) {
    console.warn(`[waitlist-confirm] welcome email send failed: ${welcome.error ?? "unknown"}`);
  }

  return page(
    "You're on the list! 🎬",
    "Your email is confirmed. We'll let you know the moment early access opens.",
    200
  );
}
