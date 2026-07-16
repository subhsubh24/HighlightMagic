/**
 * Privacy-respecting analytics for HighlightMagic web.
 *
 * Event taxonomy (visit → waitlist → install → activate → export → Pro):
 *   page_view           — automatic via Plausible script
 *   waitlist_form_view  — the waitlist form first scrolled into view (form-impression step)
 *   waitlist_signup     — user submitted the waitlist form
 *   cta_click           — user clicked any primary CTA (App Store badge, hero button)
 *   features_view       — user scrolled to the features section (mid-funnel engagement step)
 *   pricing_view        — user scrolled to / clicked the pricing section
 *   faq_open            — user expanded an FAQ item
 *
 * Owner setup (E5):
 *   1. Create a free/paid account at plausible.io (or use Vercel Analytics).
 *   2. Add the Plausible script to web/src/app/layout.tsx:
 *        <script defer data-domain="highlightmagic.app" src="https://plausible.io/js/script.js" />
 *   3. Events fire automatically via window.plausible — no further code changes needed.
 *
 * CI / server-side: trackEvent is a no-op when window is undefined or Plausible is not loaded.
 * Never sends PII — only event names + optional non-identifying properties.
 */

export type AnalyticsEvent =
  | "waitlist_form_view"
  | "waitlist_signup"
  | "cta_click"
  | "features_view"
  | "pricing_view"
  | "faq_open";

export type EventProps = {
  /** Source label for CTA clicks (hero | pricing | nav | footer) */
  source?: string;
  /** FAQ question title (truncated to 60 chars) */
  question?: string;
  [key: string]: string | undefined;
};

/**
 * Track a named event. Safe to call anywhere — no-op if Plausible is absent.
 */
export function trackEvent(event: AnalyticsEvent, props?: EventProps): void {
  if (typeof window === "undefined") return;
  type PlausibleFn = (event: string, options?: { props?: Record<string, string> }) => void;
  const plausible = (window as Window & { plausible?: PlausibleFn }).plausible;
  if (typeof plausible === "function") {
    // Filter undefined values so the props object is Record<string, string>.
    const cleanProps = props
      ? (Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined)) as Record<string, string>)
      : undefined;
    plausible(event, cleanProps ? { props: cleanProps } : undefined);
  }
}
