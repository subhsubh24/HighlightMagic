import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Highlight Magic — Turn Raw Video Into Viral Highlights",
  description:
    "AI-powered iOS app that automatically finds your best moments and exports them as polished 1080×1920 clips for TikTok, Reels, and Shorts. Free to start.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://highlightmagic.app"),
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

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
