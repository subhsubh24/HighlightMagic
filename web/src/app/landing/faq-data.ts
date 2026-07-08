/**
 * Single source of truth for the landing-page FAQ.
 *
 * Consumed BOTH by the visible accordion (page.tsx) and the FAQPage JSON-LD (layout.tsx). Google's
 * FAQ rich-result guidelines require the structured data to match the on-page copy verbatim, so
 * keeping ONE array prevents the schema and the rendered questions from drifting apart.
 */
export interface FaqEntry {
  /** Question text (rendered as the accordion header and the schema `Question` name). */
  q: string;
  /** Answer text (rendered in the accordion body and the schema `acceptedAnswer`). */
  a: string;
}

export const FAQ: FaqEntry[] = [
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
