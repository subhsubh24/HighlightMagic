import { IOS_APP_STORE_URL, IS_APP_LIVE } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 md:flex-row md:justify-between">
        <p className="text-xs text-[var(--text-tertiary)]">
          &copy; 2026 Highlight Magic. All rights reserved.
        </p>
        <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
          <a href="/privacy" className="rounded hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60">
            Privacy Policy
          </a>
          {/* Only once the app is live (launch); pre-launch the store link would 404. */}
          {IS_APP_LIVE && (
            <a
              href={IOS_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
            >
              iOS App
            </a>
          )}
          <a
            href="mailto:support@highlightmagic.app"
            className="rounded hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
          >
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}
