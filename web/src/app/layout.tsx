import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Highlight Magic — AI Video Highlights in Seconds",
  description:
    "Turn raw footage into viral Reels, TikToks, and Shorts. On-device AI finds your best moments. Free to try.",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="bg-app-gradient min-h-screen antialiased">
        {children}
        {/* PWA service worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker"in navigator){navigator.serviceWorker.register("/sw.js")}`,
          }}
        />
      </body>
    </html>
  );
}
