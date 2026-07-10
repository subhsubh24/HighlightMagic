import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support — Highlight Magic",
  description:
    "Get help with Highlight Magic: contact support, troubleshoot exports and detection, and find answers to common questions.",
};

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold text-white">Support</h1>
      <div className="prose prose-invert prose-sm max-w-none space-y-8 text-[var(--text-secondary)]">
        <section>
          <h2 className="text-lg font-semibold text-white">Contact Us</h2>
          <p>
            Need help? Email us at{" "}
            <a
              href="mailto:support@highlightmagic.app"
              className="text-[var(--accent)] underline"
            >
              support@highlightmagic.app
            </a>{" "}
            and we&apos;ll get back to you as soon as possible.
          </p>
          <p className="mt-2">
            For privacy questions, contact{" "}
            <a
              href="mailto:privacy@highlightmagic.app"
              className="text-[var(--accent)] underline"
            >
              privacy@highlightmagic.app
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">Frequently Asked Questions</h2>

          <div className="space-y-6 mt-4">
            <div>
              <h3 className="font-semibold text-white">How do I cancel my Pro subscription?</h3>
              <p className="mt-1">
                Subscriptions are managed through Apple. On your iPhone: open{" "}
                <strong className="text-white">Settings</strong> → tap your name →{" "}
                <strong className="text-white">Subscriptions</strong> → select{" "}
                <strong className="text-white">Highlight Magic</strong> →{" "}
                <strong className="text-white">Cancel Subscription</strong>.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white">
                I purchased Pro but the app still shows Free. What do I do?
              </h3>
              <p className="mt-1">
                Open the app, go to <strong className="text-white">Settings</strong>, and tap{" "}
                <strong className="text-white">Restore Purchases</strong>. This re-checks your
                active subscriptions with Apple. If the issue persists, try restarting the app.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white">How do I delete my data?</h3>
              <p className="mt-1">
                In the iOS app, go to{" "}
                <strong className="text-white">Settings &rarr; Delete All Data</strong>. This
                permanently removes your anonymous ID, project history, and all locally stored
                data. See our{" "}
                <a href="/privacy" className="text-[var(--accent)] underline">
                  Privacy Policy
                </a>{" "}
                for full details.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white">
                Why did my export use up one of my free credits?
              </h3>
              <p className="mt-1">
                Each completed export counts toward your 5 free exports per month. The count resets
                at the start of each calendar month. Upgrade to Pro for unlimited monthly exports (a
                50-per-day fair-use ceiling applies to all plans).
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white">What video formats can I import?</h3>
              <p className="mt-1">
                Highlight Magic supports standard iOS video formats including MP4, MOV, and M4V.
                Maximum video length is 10 minutes per clip.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white">
                Does Highlight Magic upload my full videos?
              </h3>
              <p className="mt-1">
                No. Full video files stay on your device. Only sampled video frames (approximately
                1 per second, at reduced resolution) are sent to our AI servers for highlight
                detection. See our{" "}
                <a href="/privacy" className="text-[var(--accent)] underline">
                  Privacy Policy
                </a>{" "}
                for complete details.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white">How do I get a refund?</h3>
              <p className="mt-1">
                Refund requests for App Store purchases are handled directly by Apple. Visit{" "}
                <a
                  href="https://reportaproblem.apple.com"
                  className="text-[var(--accent)] underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  reportaproblem.apple.com
                </a>{" "}
                to request a refund.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">Legal</h2>
          <div className="flex gap-4 mt-2">
            <a href="/privacy" className="text-[var(--accent)] underline text-sm">
              Privacy Policy
            </a>
            <a href="/terms" className="text-[var(--accent)] underline text-sm">
              Terms of Use
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
