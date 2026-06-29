"use client";

import { useEffect, useRef } from "react";

// Track H5 — Cloudflare Turnstile widget (frontend half).
//
// The waitlist API (web/src/app/api/waitlist/route.ts) ALREADY verifies a Turnstile token
// server-side whenever TURNSTILE_SECRET_KEY is configured. Without this widget rendering on the
// page, enabling that secret would BREAK the form: the backend rejects every signup with
// "CAPTCHA required" because the client never produces a token. This component closes that loop —
// it renders the challenge and hands the resulting token to the form, but ONLY when the public
// site key (NEXT_PUBLIC_TURNSTILE_SITE_KEY) is set. With no site key it renders nothing and the
// form behaves exactly as before (no bot protection until the owner connects Turnstile).
//
// CSP: the Turnstile script + its challenge iframe load from challenges.cloudflare.com. The script
// is allowed under the nonce-based `script-src 'strict-dynamic'` policy (a trusted, nonce'd React
// chunk creates it, so trust propagates); the iframe needs `frame-src https://challenges.cloudflare.com`
// (added in middleware.ts).

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "auto" | "light" | "dark";
          size?: "normal" | "flexible" | "compact";
        }
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

// Load the Turnstile script exactly once across the app, resolving when window.turnstile exists.
let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    // On failure, clear the cached promise so a later mount can retry — otherwise a single flaky
    // first load would leave the widget permanently blank (submit stuck disabled) for the session.
    const fail = () => {
      scriptPromise = null;
      reject(new Error("turnstile load failed"));
    };
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", fail);
      if (window.turnstile) resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface TurnstileProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  className?: string;
}

export function Turnstile({ siteKey, onVerify, onExpire, className }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Keep the latest callbacks without re-rendering the widget (which would reset the challenge).
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;

  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        // Guard against React 18 StrictMode double-invoke rendering two widgets.
        if (widgetIdRef.current !== null) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => onVerifyRef.current(token),
          "expired-callback": () => onExpireRef.current?.(),
          "error-callback": () => onExpireRef.current?.(),
          theme: "auto",
          size: "flexible",
        });
      })
      .catch(() => {
        // Script failed to load (network/CSP). The form's submit stays disabled until a token
        // arrives, so a failed widget can't silently bypass the CAPTCHA. Owner can retry.
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget already gone */
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  return <div ref={containerRef} className={className} />;
}
