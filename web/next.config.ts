import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PWA headers for service worker
  headers: async () => [
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
