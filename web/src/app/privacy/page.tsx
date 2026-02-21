export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold text-white">Privacy Policy</h1>
      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-[var(--text-secondary)]">
        <p className="text-sm text-[var(--text-tertiary)]">Last updated: February 2026</p>

        <section>
          <h2 className="text-lg font-semibold text-white">Overview</h2>
          <p>
            Highlight Magic (&quot;we&quot;, &quot;our&quot;) respects your privacy. This policy explains how the web
            version of Highlight Magic handles your data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">Video Processing</h2>
          <p>
            When you upload a video, frames are extracted in your browser and sent to our secure
            server for AI analysis via the Anthropic Claude Vision API. Video frames are processed
            in real-time and <strong>not stored</strong> on our servers after analysis is complete.
            Full video files are never uploaded — only sampled frames.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">Data We Collect</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>No personal information is collected</li>
            <li>No account or login is required</li>
            <li>No cookies or tracking pixels are used</li>
            <li>Export counts are stored locally in your browser</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">Third-Party Services</h2>
          <p>
            We use the Anthropic Claude Vision API for AI frame analysis. Anthropic&apos;s data
            handling is governed by their{" "}
            <a
              href="https://www.anthropic.com/privacy"
              className="text-[var(--accent)] underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              privacy policy
            </a>
            . Per Anthropic&apos;s API terms, data sent via the API is not used for model training.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">iOS App</h2>
          <p>
            The Highlight Magic iOS app processes all video analysis 100% on-device using Apple
            Vision and Core ML. No video data leaves your phone. See the iOS privacy policy for
            details.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">Contact</h2>
          <p>
            Questions? Email us at{" "}
            <a href="mailto:privacy@highlightmagic.app" className="text-[var(--accent)] underline">
              privacy@highlightmagic.app
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
