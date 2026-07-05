import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { ServiceWorkerRegister } from "./sw-register";

export const metadata: Metadata = {
  title: "Highlight Magic — AI Video Highlights in Seconds",
  description:
    "Turn raw footage into viral Reels, TikToks, and Shorts. AI finds your best moments automatically. Free to try.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://highlightmagic.app"),
  openGraph: {
    title: "Highlight Magic — AI Video Highlights in Seconds",
    description: "Turn raw footage into viral Reels in seconds with AI.",
    type: "website",
    siteName: "Highlight Magic",
  },
  twitter: {
    card: "summary_large_image",
    title: "Highlight Magic",
    description: "AI Video Highlights in Seconds",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Highlights",
  },
};

export const viewport: Viewport = {
  themeColor: "#7C3AED",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Track H6: reading the request headers opts rendering into per-request (dynamic) mode so
  // Next.js stamps the middleware-issued nonce onto its bootstrap scripts. Without this, the
  // statically-prerendered HTML ships un-nonce'd scripts that the strict-dynamic CSP blocks,
  // breaking hydration.
  const h = await headers();

  // Track E5 — Plausible analytics (privacy-friendly, no cookies). Only load on the PRODUCTION
  // host, so it never fires in local dev, CI/e2e, or Vercel preview (no data pollution, and no
  // external fetch that could flake the journey suite). The nonce is required by the Track H6
  // strict-dynamic CSP (extracted from the middleware-set CSP header). Starts reporting the moment
  // the owner creates the plausible.io account for highlightmagic.app — no further code change.
  const nonce = (h.get("content-security-policy") ?? "").match(/'nonce-([^']+)'/)?.[1];
  const host = h.get("host") ?? "";
  const analyticsEnabled =
    (host === "highlightmagic.app" || host === "www.highlightmagic.app") && Boolean(nonce);

  return (
    <html lang="en" className="dark">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        {analyticsEnabled && (
          <script
            defer
            data-domain="highlightmagic.app"
            src="https://plausible.io/js/script.js"
            nonce={nonce}
          />
        )}
      </head>
      <body className="bg-app-gradient min-h-screen antialiased">
        {children}
        {/* PWA service worker registration — bundled (nonce'd) module, not an inline
            script, so it works under the Track H6 CSP without 'unsafe-inline'. */}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
