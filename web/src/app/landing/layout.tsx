import type { Metadata } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://highlightmagic.app";

export const metadata: Metadata = {
  title: "Highlight Magic — Turn Raw Video Into Viral Highlights",
  description:
    "AI-powered iOS app that automatically finds your best moments and exports them as polished 1080×1920 clips for TikTok, Reels, and Shorts. Free to start.",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "Highlight Magic — Turn Raw Video Into Viral Highlights",
    description:
      "AI finds your best moments. You share the highlights. Free iOS app.",
    type: "website",
    siteName: "Highlight Magic",
    url: "/landing",
  },
  twitter: {
    card: "summary_large_image",
    title: "Highlight Magic — Turn Raw Video Into Viral Highlights",
    description:
      "AI-powered iOS app that turns raw footage into viral TikToks, Reels, and Shorts. Free to start.",
  },
};

// Schema.org SoftwareApplication structured data (JSON-LD). Enriches search snippets and
// app-discovery surfaces with the REAL, honest facts: platform, category, and the three price
// points. Prices MIRROR the live config ($0 free / $14.99 monthly / $149.99 yearly — the same
// values in StoreKitConfiguration.storekit, the pricing card, and the ASO package). No
// aggregateRating/reviews are declared: the app is unreleased, so any rating would be
// fabricated (honesty rule).
const softwareAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Highlight Magic",
  description:
    "AI-powered iOS app that automatically finds your best moments and exports them as polished 1080×1920 clips for TikTok, Reels, and Shorts.",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "iOS 18.0",
  url: SITE_URL,
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "USD",
    lowPrice: "0",
    highPrice: "149.99",
    offerCount: "3",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
      { "@type": "Offer", name: "Pro Monthly", price: "14.99", priceCurrency: "USD" },
      { "@type": "Offer", name: "Pro Yearly", price: "149.99", priceCurrency: "USD" },
    ],
  },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        // Static object serialized to JSON — no user input is interpolated, so this inline
        // JSON-LD script is safe.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
      />
      {children}
    </>
  );
}
