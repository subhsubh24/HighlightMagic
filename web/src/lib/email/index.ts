/**
 * E6b — Email send abstraction (Growth Execution Engine).
 *
 * ONE provider abstraction so the staged email lifecycle (welcome → activation →
 * conversion → win-back, drafts in docs/growth/email-sequences.md) can actually fire the
 * moment the owner connects a provider. Currently implements Resend (recommended in
 * docs/growth/CONNECT.md); adding SendGrid/Mailchimp is a new `case` here, nothing else.
 *
 * DRY-RUN SAFE: with no provider env var set the engine stays in dry-run — every send is a
 * logged no-op that resolves `{ ok: true, dryRun: true }` and NEVER throws. This keeps the
 * waitlist + confirm flow working locally, in tests, and on prod before any channel is
 * connected (GROWTH_STATUS.awaiting_connect stays true until creds are present).
 *
 * SECURITY: keys are read from server-side env ONLY (never NEXT_PUBLIC_*, never committed).
 * The Growth Agent holds no secrets — the deployed backend sends.
 */

export type EmailProvider = "resend" | "none";

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Plain-text body. HTML is derived from this when the provider needs it. */
  text: string;
  html?: string;
}

export interface SendEmailResult {
  ok: boolean;
  dryRun: boolean;
  provider: EmailProvider;
  id?: string;
  error?: string;
}

/** From-address for transactional waitlist email. Override with EMAIL_FROM in env. */
function fromAddress(): string {
  return process.env.EMAIL_FROM || "Highlight Magic <hello@highlightmagic.app>";
}

/**
 * Which email provider is connected, derived purely from env. `none` => dry-run.
 */
export function emailProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) return "resend";
  return "none";
}

/** True when a real provider is connected (engine can actually send). */
export function isEmailConfigured(): boolean {
  return emailProvider() !== "none";
}

function minimalHtml(text: string): string {
  // Escape and turn newlines into <br> — no template framework, no tracking pixels.
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">${escaped.replace(/\n/g, "<br>")}</div>`;
}

/**
 * Send one email through the connected provider. Dry-run no-op when none is connected.
 * Never throws — provider/network failures resolve `{ ok: false }` so callers can fail-open.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const provider = emailProvider();
  const to = input.to.trim().toLowerCase();

  if (provider === "none") {
    // Dry-run: visible in server logs, safe before any channel is connected.
    console.log(`[email:dry-run] to=${to} subject="${input.subject}"`);
    return { ok: true, dryRun: true, provider: "none" };
  }

  try {
    if (provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress(),
          to,
          subject: input.subject,
          text: input.text,
          html: input.html ?? minimalHtml(input.text),
        }),
      });
      if (!res.ok) {
        // Log full context server-side; surface nothing sensitive to callers (Track H3).
        console.error(`[email:resend] send failed status=${res.status}`);
        return { ok: false, dryRun: false, provider, error: "send_failed" };
      }
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      return { ok: true, dryRun: false, provider, id: data.id };
    }
  } catch (err) {
    console.error("[email] send error:", err instanceof Error ? err.message : String(err));
    return { ok: false, dryRun: false, provider, error: "send_error" };
  }

  return { ok: false, dryRun: false, provider, error: "unsupported_provider" };
}

/**
 * Double-opt-in confirmation email (E6a). `confirmUrl` is the absolute link the recipient
 * clicks to confirm. Dry-run safe.
 */
export function buildConfirmationEmail(confirmUrl: string): { subject: string; text: string } {
  return {
    subject: "Confirm your spot on the Highlight Magic waitlist",
    text:
      "Thanks for joining the Highlight Magic waitlist!\n\n" +
      "Tap the link below to confirm your email and lock in early access:\n\n" +
      `${confirmUrl}\n\n` +
      "If you didn't sign up, you can safely ignore this email.\n\n" +
      "— The Highlight Magic team",
  };
}

/** Welcome email sent after a confirmed signup. Dry-run safe. */
export function buildWelcomeEmail(): { subject: string; text: string } {
  return {
    subject: "You're on the Highlight Magic waitlist 🎬",
    text:
      "You're confirmed — welcome to the Highlight Magic waitlist.\n\n" +
      "We turn your raw clips into share-ready vertical highlights with AI. " +
      "We'll email you the moment early access opens.\n\n" +
      "— The Highlight Magic team",
  };
}
