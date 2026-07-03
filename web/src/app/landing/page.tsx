"use client";

import { useState, useId, useEffect, useRef } from "react";
import {
  Sparkles,
  Zap,
  Film,
  Share2,
  Check,
  ChevronDown,
  Star,
  Download,
} from "lucide-react";
import { IOS_APP_STORE_URL } from "@/lib/constants";
import { trackEvent } from "@/lib/analytics";
import { Turnstile } from "@/components/Turnstile";

// Track H5 — public Turnstile site key. Inlined at build time by Next. When unset, the waitlist
// form renders no CAPTCHA and behaves as before; when set (owner connects Turnstile), the widget
// renders and a token is required before submit, matching the server-side check in /api/waitlist.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// ── Waitlist form ──────────────────────────────────────────────────────────

function WaitlistForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  // Whether a confirmation email actually left the system (server tells us). Drives HONEST copy:
  // only promise "check your email to confirm" when one was really dispatched (SIDE-EFFECT INTEGRITY).
  const [confirmSent, setConfirmSent] = useState(false);
  // Track H5: when Turnstile is configured, hold the verification token; submit is blocked until
  // the challenge passes. When TURNSTILE_SITE_KEY is unset, this stays null and never gates submit.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Turnstile tokens are single-use; bumping this remounts the widget to issue a fresh one
  // after a failed submit so a retry isn't stuck holding a spent token.
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const captchaRequired = Boolean(TURNSTILE_SITE_KEY);

  function resetCaptcha() {
    if (!captchaRequired) return;
    setTurnstileToken(null);
    setCaptchaNonce((n) => n + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    if (captchaRequired && !turnstileToken) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          turnstileToken ? { email, cfTurnstileToken: turnstileToken } : { email }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong.");
        setStatus("error");
        resetCaptcha();
      } else {
        trackEvent("waitlist_signup");
        setConfirmSent(Boolean(data.confirmationEmailSent));
        setStatus("success");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
      resetCaptcha();
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-3 rounded-2xl border border-[var(--success)]/30 bg-[var(--success)]/10 px-5 py-4 ${compact ? "max-w-sm" : "max-w-md"}`}
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--success)]/20">
          <Check className="h-4 w-4 text-[var(--success)]" />
        </div>
        <div>
          <p className="font-semibold text-[var(--success)]">
            {confirmSent ? "Almost there!" : "You're on the list!"}
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            {confirmSent
              ? "Check your email to confirm your spot."
              : "We'll email you when HighlightMagic launches."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`w-full ${compact ? "max-w-sm" : "max-w-md"}`}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          required
          aria-label="Email address"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/20 transition-all"
          disabled={status === "loading"}
        />
        <button
          type="submit"
          disabled={status === "loading" || !email.trim() || (captchaRequired && !turnstileToken)}
          className="btn-primary flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "loading" ? "Joining…" : "Join Waitlist"}
        </button>
      </div>
      {TURNSTILE_SITE_KEY && (
        <div className="mt-3">
          <Turnstile
            key={captchaNonce}
            siteKey={TURNSTILE_SITE_KEY}
            onVerify={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken(null)}
          />
        </div>
      )}
      {status === "error" && (
        <p role="alert" className="mt-2 text-sm text-[var(--error)]">{errorMsg}</p>
      )}
    </form>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Import your footage",
    description:
      "Pick videos from your camera roll — sports clips, travel vlogs, concerts, family moments. Any length.",
    icon: Film,
  },
  {
    step: "02",
    title: "AI finds the magic",
    description:
      "Our AI samples and scores frames across your footage to detect peak moments: the goal, the laugh, the drop. No scrubbing required.",
    icon: Sparkles,
  },
  {
    step: "03",
    title: "Export & share",
    description:
      "Get a polished 1080×1920 clip with captions, transitions, and effects — export-ready for TikTok, Reels, and Shorts in seconds.",
    icon: Share2,
  },
];

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI Highlight Detection",
    description:
      "Automatically finds the most engaging moments across your footage — no manual scrubbing.",
  },
  {
    icon: Zap,
    title: "Auto Captions & Effects",
    description:
      "Kinetic text, transitions, color filters — all styled to match your content.",
  },
  {
    icon: Film,
    title: "Vertical-First Export",
    description:
      "Perfect 1080×1920 MP4 — optimized bitrate and framing for every major short-form platform.",
  },
  {
    icon: Download,
    title: "One-Tap Share",
    description:
      "Share directly to TikTok, Instagram Reels, YouTube Shorts, or save to your camera roll.",
  },
];

type PricingPlan = {
  name: string;
  price: string;
  period: string;
  annualNote: string | null;
  description: string;
  highlight: boolean;
  features: string[];
  cta: string;
  ctaHref: string | null;
};

const PRICING: PricingPlan[] = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    annualNote: null,
    description: "Perfect for trying out HighlightMagic.",
    highlight: false,
    features: [
      "5 exports per month",
      "AI highlight detection",
      "Auto captions & transitions",
      "1080×1920 MP4 export",
      "HighlightMagic watermark",
    ],
    cta: "Get the App",
    ctaHref: IOS_APP_STORE_URL,
  },
  {
    name: "Pro",
    price: "$14.99",
    period: "/ month",
    annualNote: "or $149.99/year — 2 months free",
    description: "For creators who publish consistently.",
    highlight: true,
    features: [
      "Unlimited monthly exports",
      "No watermark",
      "AI highlight detection",
      "Auto captions & transitions",
      "1080×1920 MP4 export",
      "Priority processing",
    ],
    cta: "Join the Waitlist",
    ctaHref: null,
  },
];

const FAQ = [
  {
    q: "What is HighlightMagic?",
    a: "HighlightMagic is an iOS app that uses AI to automatically find the best moments in your raw footage and turn them into polished, share-ready vertical video clips for TikTok, Reels, and Shorts.",
  },
  {
    q: "How does the AI work?",
    a: "We sample frames across your footage and score each moment for energy, emotion, and visual quality using Claude AI. The highest-scoring moments are assembled into a highlight reel with smooth transitions, animated captions, and color filters.",
  },
  {
    q: "What platforms is it for?",
    a: "HighlightMagic exports perfect 1080×1920 MP4 files — the native format for TikTok, Instagram Reels, and YouTube Shorts. You can also share to any app via the iOS share sheet.",
  },
  {
    q: "Is it really free?",
    a: "Yes. The free tier includes 5 full AI-powered exports per month with all core features. Pro ($14.99/month, or $149.99/year) removes the watermark and removes the monthly cap — export as much as you create, day after day. A generous per-day rate limit applies as a routine anti-abuse safeguard, set well above any realistic creative workflow.",
  },
  {
    q: "When is the app available?",
    a: "We're putting the finishing touches on v1.0. Join the waitlist and we'll email you the day it launches on the App Store.",
  },
  {
    q: "Does it work with sports, travel, and event footage?",
    a: "Absolutely. HighlightMagic is designed for any action-packed content — sports games, concerts, travel vlogs, parties, workouts, and more.",
  },
];

// ── FAQ accordion item ─────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="border-b border-white/8 last:border-b-0">
      <button
        onClick={() => { setOpen(!open); if (!open) trackEvent("faq_open", { question: q.slice(0, 60) }); }}
        className="flex w-full items-start justify-between gap-4 py-5 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="font-semibold text-[var(--text-primary)]">{q}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-5 w-5 flex-shrink-0 text-[var(--text-tertiary)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {/* Always rendered (hidden when collapsed) so aria-controls always resolves to a real node. */}
      <p id={panelId} hidden={!open} className="pb-5 text-[var(--text-secondary)] leading-relaxed">{a}</p>
    </div>
  );
}

// ── Nav ────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[var(--bg-primary)]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-gradient">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-white">Highlight Magic</span>
        </div>
        <nav className="hidden items-center gap-6 md:flex">
          <a href="#features" className="text-sm text-[var(--text-secondary)] hover:text-white transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60">
            Features
          </a>
          <a href="#pricing" className="text-sm text-[var(--text-secondary)] hover:text-white transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60">
            Pricing
          </a>
          <a href="#faq" className="text-sm text-[var(--text-secondary)] hover:text-white transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60">
            FAQ
          </a>
        </nav>
        <a
          href={IOS_APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent("cta_click", { source: "nav" })}
          className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors"
        >
          Get the App
        </a>
      </div>
    </header>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function LandingPage() {
  const pricingRef = useRef<HTMLElement>(null);

  // Funnel instrumentation: fire `pricing_view` once when the pricing section first scrolls into
  // view. This is the visitor→pricing step of the acquisition funnel that analytics.ts already
  // defines but nothing emitted. Fires at most once, then disconnects; a no-op when analytics is
  // not loaded (trackEvent guards window/Plausible) or when IntersectionObserver is unavailable.
  useEffect(() => {
    const el = pricingRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          trackEvent("pricing_view");
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-app-gradient text-[var(--text-primary)]">
      <Nav />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden px-6 pb-24 pt-20 text-center">
        {/* Background glow */}
        <div
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] rounded-full opacity-20"
          style={{ background: "radial-gradient(ellipse, #7C3AED 0%, transparent 70%)" }}
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-4xl">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-1.5 text-sm text-[var(--accent)]">
            <Star className="h-3.5 w-3.5 fill-current" />
            <span>Coming soon to the App Store</span>
          </div>

          <h1 className="mb-6 text-5xl font-extrabold tracking-tight md:text-7xl">
            Turn Your Best Moments{" "}
            <span className="gradient-text">Into Viral Highlights</span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-xl leading-relaxed text-[var(--text-secondary)]">
            HighlightMagic is an AI-powered iOS app that automatically detects your best video
            moments and exports polished 1080×1920 clips — ready for TikTok, Reels, and Shorts
            in seconds.
          </p>

          <div className="flex flex-col items-center gap-4">
            <WaitlistForm />
            <p className="text-sm text-[var(--text-tertiary)]">
              No credit card required &middot; 5 free exports per month
            </p>
            <a
              href={IOS_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-white transition-colors"
            >
              <Download className="h-4 w-4" />
              Already have the app? Download on the App Store
            </a>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <h2 className="mb-3 text-3xl font-bold md:text-4xl">
              From raw footage to viral clip in{" "}
              <span className="gradient-text">three steps</span>
            </h2>
            <p className="text-[var(--text-secondary)]">No editing experience required.</p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {HOW_IT_WORKS.map(({ step, title, description, icon: Icon }) => (
              <div key={step} className="glass-card p-7">
                <div className="mb-5 flex items-center gap-4">
                  <span className="text-5xl font-black text-[var(--accent)]/20 leading-none">
                    {step}
                  </span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/15">
                    <Icon className="h-5 w-5 text-[var(--accent)]" />
                  </div>
                </div>
                <h3 className="mb-2 text-lg font-semibold">{title}</h3>
                <p className="text-[var(--text-secondary)] leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <h2 className="mb-3 text-3xl font-bold md:text-4xl">
              Everything you need to go{" "}
              <span className="gradient-text">viral</span>
            </h2>
            <p className="text-[var(--text-secondary)]">
              A full creative studio in your pocket.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="glass-card p-6 transition-all duration-200 hover:border-[var(--accent)]/20 hover:bg-[var(--accent)]/5"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/15">
                  <Icon className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <h3 className="mb-2 font-semibold">{title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social proof bar ── */}
      <section className="border-y border-white/5 bg-white/2 px-6 py-10">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-lg font-medium text-[var(--text-secondary)]">
            Built for creators who post on{" "}
            <span className="text-white font-semibold">TikTok</span>,{" "}
            <span className="text-white font-semibold">Instagram Reels</span>, and{" "}
            <span className="text-white font-semibold">YouTube Shorts</span>
          </p>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" ref={pricingRef} className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <h2 className="mb-3 text-3xl font-bold md:text-4xl">
              Simple,{" "}
              <span className="gradient-text">transparent</span> pricing
            </h2>
            <p className="text-[var(--text-secondary)]">
              Start free. Go Pro when you&apos;re ready to scale.
            </p>
          </div>

          <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
            {PRICING.map((plan) => (
              <div
                key={plan.name}
                className={`glass-card flex flex-col p-8 ${
                  plan.highlight
                    ? "border-[var(--accent)]/40 ring-1 ring-[var(--accent)]/20"
                    : ""
                }`}
              >
                {plan.highlight && (
                  <div className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-gradient px-3 py-1 text-xs font-semibold text-white">
                    <Star className="h-3 w-3 fill-current" />
                    Most Popular
                  </div>
                )}
                <h3 className="mb-1 text-xl font-bold">{plan.name}</h3>
                <div className="mb-1 flex items-end gap-1">
                  <span className="text-4xl font-black">{plan.price}</span>
                  <span className="mb-1 text-[var(--text-secondary)]">{plan.period}</span>
                </div>
                {plan.annualNote && (
                  <p className="mb-1 text-xs font-medium text-[var(--text-secondary)]">{plan.annualNote}</p>
                )}
                <p className="mb-6 text-sm text-[var(--text-secondary)]">{plan.description}</p>

                <ul className="mb-8 flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm">
                      <Check className="h-4 w-4 flex-shrink-0 text-[var(--success)]" />
                      <span className="text-[var(--text-secondary)]">{f}</span>
                    </li>
                  ))}
                </ul>

                {plan.ctaHref ? (
                  <a
                    href={plan.ctaHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent("cta_click", { source: "pricing" })}
                    className={`block rounded-2xl py-3 text-center text-sm font-semibold transition-all ${
                      plan.highlight
                        ? "btn-primary"
                        : "border border-white/15 text-white hover:bg-white/5"
                    }`}
                  >
                    {plan.cta}
                  </a>
                ) : (
                  <a
                    href="#waitlist-bottom"
                    onClick={() => trackEvent("cta_click", { source: "pricing" })}
                    className={`block rounded-2xl py-3 text-center text-sm font-semibold transition-all ${
                      plan.highlight
                        ? "btn-primary"
                        : "border border-white/15 text-white hover:bg-white/5"
                    }`}
                  >
                    {plan.cta}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <div className="mb-14 text-center">
            <h2 className="mb-3 text-3xl font-bold md:text-4xl">
              Frequently asked{" "}
              <span className="gradient-text">questions</span>
            </h2>
          </div>

          <div className="glass-card px-8">
            {FAQ.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section
        id="waitlist-bottom"
        className="relative overflow-hidden px-6 py-24 text-center"
      >
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[600px] rounded-full opacity-15"
          style={{ background: "radial-gradient(ellipse, #EC4899 0%, #7C3AED 50%, transparent 70%)" }}
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Ready to make your highlights go{" "}
            <span className="gradient-text">viral?</span>
          </h2>
          <p className="mb-8 text-[var(--text-secondary)]">
            Join the waitlist and be the first to know when HighlightMagic launches.
          </p>
          <div className="flex flex-col items-center gap-3">
            <WaitlistForm compact />
            <p className="text-sm text-[var(--text-tertiary)]">
              No spam, ever. Unsubscribe anytime.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 md:flex-row md:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-gradient">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold text-white">Highlight Magic</span>
          </div>

          <p className="text-sm text-[var(--text-tertiary)]">
            &copy; 2026 Highlight Magic. All rights reserved.
          </p>

          <div className="flex items-center gap-5 text-sm text-[var(--text-tertiary)]">
            <a href="/privacy" className="rounded hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60">
              Privacy Policy
            </a>
            <a href="/terms" className="rounded hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60">
              Terms of Use
            </a>
            <a href="/support" className="rounded hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60">
              Support
            </a>
            <a
              href={IOS_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
            >
              iOS App
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
