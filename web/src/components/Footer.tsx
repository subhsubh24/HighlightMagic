import { IOS_APP_STORE_URL } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 md:flex-row md:justify-between">
        <p className="text-xs text-[var(--text-tertiary)]">
          &copy; 2026 Highlight Magic. All rights reserved.
        </p>
        <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
          <a href="/privacy" className="hover:text-white transition-colors">
            Privacy Policy
          </a>
          <a
            href={IOS_APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            iOS App
          </a>
          <a
            href="mailto:support@highlightmagic.app"
            className="hover:text-white transition-colors"
          >
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}
