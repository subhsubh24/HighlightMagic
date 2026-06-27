import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
  headers: async () => [
    // Security headers applied to all routes (Track H6)
    {
      source: "/(.*)",
      headers: [
        // Prevent MIME-type sniffing
        { key: "X-Content-Type-Options", value: "nosniff" },
        // Prevent clickjacking
        { key: "X-Frame-Options", value: "DENY" },
        // Legacy XSS filter
        { key: "X-XSS-Protection", value: "1; mode=block" },
        // Force HTTPS for 1 year (HSTS)
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
        // Limit referrer leakage
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // Restrict access to sensitive browser APIs
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    },
    // API routes: CORS locked to the app's own origin
    {
      source: "/api/(.*)",
      headers: [
        { key: "Access-Control-Allow-Origin", value: "https://highlightmagic.app" },
        { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
        { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
      ],
    },
    // PWA service worker cache headers
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
  ],
  // Allow video blob URLs
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
