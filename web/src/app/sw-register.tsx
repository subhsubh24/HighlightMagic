"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker from a real bundled module instead of an inline
 * <script> tag. Under the Track H6 nonce CSP an un-nonce'd inline script is blocked;
 * a client component runs as a Next-managed (nonce'd) bundle, so registration keeps
 * working without weakening the policy with 'unsafe-inline'.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration is best-effort; the app works without the SW.
      });
    }
  }, []);

  return null;
}
