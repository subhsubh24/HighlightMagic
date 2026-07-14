"use client";

import { useApp } from "@/lib/store";
import { Sparkles } from "lucide-react";
import { IOS_APP_STORE_URL, IS_APP_LIVE } from "@/lib/constants";

export default function Header() {
  const { state, dispatch } = useApp();

  return (
    <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
      <button
        onClick={() => dispatch({ type: "RESET" })}
        aria-label="Reset to home"
        className="flex items-center gap-2 rounded-lg text-white transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-gradient">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-bold">Highlight Magic</span>
      </button>

      <div className="flex items-center gap-3">
        {/* Only once the app is live (launch); pre-launch the store link would 404. */}
        {IS_APP_LIVE && !state.isProUser && (
          <a
            href={IOS_APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0f]"
          >
            Get iOS App
          </a>
        )}
      </div>
    </header>
  );
}
