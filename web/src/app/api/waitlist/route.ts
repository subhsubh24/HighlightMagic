import { NextRequest, NextResponse } from "next/server";

// Waitlist submission handler.
// Owner action: connect a real email provider (Resend, Mailchimp, ConvertKit, etc.)
// by replacing the console.log below with the provider SDK call.
// All submissions are logged to Vercel function logs in the meantime.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    // TODO (owner): replace this log with a real email provider call, e.g.
    //   await resend.contacts.create({ email, audienceId: process.env.RESEND_AUDIENCE_ID });
    console.log(`[waitlist] ${new Date().toISOString()} ${email}`);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 });
  }
}
