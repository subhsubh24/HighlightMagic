import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Highlight Magic",
  description:
    "How Highlight Magic (web and iOS) handles your data: what we collect, how uploaded video is processed and retained, and the choices you have.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold text-white">Privacy Policy</h1>
      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-[var(--text-secondary)]">
        <p className="text-sm text-[var(--text-tertiary)]">Last updated: June 2026</p>

        <section>
          <h2 className="text-lg font-semibold text-white">Overview</h2>
          <p>
            Highlight Magic (&quot;we&quot;, &quot;our&quot;) respects your privacy. This policy
            explains how Highlight Magic (web and iOS) handles your data. We collect only what is
            necessary to provide the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">What is sent off-device</h2>
          <p>
            Creating a highlight reel requires AI analysis and generation, which happens on our
            servers and via third-party AI APIs. Here is exactly what leaves your device:
          </p>
          <ul className="list-disc space-y-2 pl-5 mt-2">
            <li>
              <strong className="text-white">Video frames (JPEG images)</strong> — sampled from
              your video at approximately 1 frame per second, downscaled to roughly 480&nbsp;px on
              the web or 512&nbsp;px in the iOS app. These are sent to our server and then to{" "}
              <strong>Anthropic Claude</strong> for AI highlight detection. Full video files are not
              uploaded.
            </li>
          </ul>
          <p className="mt-2">
            In the current version of the app, AI highlight detection (video frames → Anthropic
            Claude, above) is the <strong>only</strong> data flow to a third-party AI provider. The
            audio and video-generation integrations below are built into our backend but are{" "}
            <strong>not enabled in the current version</strong>, so no data is sent to these
            providers today. They are documented here so this policy stays accurate if they are
            turned on in a future release:
          </p>
          <ul className="list-disc space-y-2 pl-5 mt-2">
            <li>
              <strong className="text-white">Photos</strong> — if photo animation is enabled in a
              future release, uploaded images would be sent to <strong>AtlasCloud (Kling)</strong>{" "}
              to generate animated video clips.
            </li>
            <li>
              <strong className="text-white">Text prompts</strong> — if AI music, sound effects, or
              voiceover are enabled, text-only prompts (no audio from you) would be sent to{" "}
              <strong>ElevenLabs</strong> to generate audio. If voice cloning is enabled, a short
              audio sample you provide would be sent to ElevenLabs to create a temporary voice model.
            </li>
            <li>
              <strong className="text-white">AI-generated clips</strong> — if intro/outro card
              generation is enabled, a text prompt and style description would be sent to{" "}
              <strong>AtlasCloud</strong> for video generation.
            </li>
          </ul>
          <p className="mt-2">
            We do not sell, rent, or share your media with anyone beyond the third-party APIs
            listed above and only as needed to provide the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">Data we store locally</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              An anonymous random ID (stored in your browser&apos;s local storage or iOS Keychain)
              used only to track your free-tier export count. It is not linked to any personal
              information.
            </li>
            <li>Your free-tier export count for the current month.</li>
            <li>
              Pro subscribers: your active subscription status, verified via Apple&apos;s
              StoreKit. We do not store payment information.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">Data we do not collect</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>No name, email, or account is required to use Highlight Magic.</li>
            <li>No advertising identifiers or cross-app tracking.</li>
            <li>No analytics SDKs or third-party tracking pixels.</li>
            <li>No persistent server-side storage of your video frames or generated media.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">Third-party AI providers</h2>
          <p>The following providers process data on our behalf to deliver the service:</p>
          <ul className="list-disc space-y-2 pl-5 mt-2">
            <li>
              <strong className="text-white">Anthropic</strong> — receives video frames for AI
              highlight detection and tape planning. Per Anthropic&apos;s API usage policy, data
              sent via the API is not used to train their models.{" "}
              <a
                href="https://www.anthropic.com/privacy"
                className="text-[var(--accent)] underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Anthropic Privacy Policy
              </a>
            </li>
            <li>
              <strong className="text-white">ElevenLabs</strong> —{" "}
              <em>not enabled in the current version.</em> When the audio features are turned on it
              would receive text prompts to generate music, sound effects, and voiceover audio; if
              voice cloning is used, a short audio sample is sent and ElevenLabs deletes cloned
              voices after generation.{" "}
              <a
                href="https://elevenlabs.io/privacy"
                className="text-[var(--accent)] underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                ElevenLabs Privacy Policy
              </a>
            </li>
            <li>
              <strong className="text-white">AtlasCloud</strong> —{" "}
              <em>not enabled in the current version.</em> When photo animation / AI video
              generation (intro/outro cards) is turned on it would receive images and text
              prompts.{" "}
              <a
                href="https://atlascloud.ai/privacy"
                className="text-[var(--accent)] underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                AtlasCloud Privacy Policy
              </a>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">Data retention</h2>
          <p>
            Video frames sent for analysis are processed in real-time and not retained on our
            servers after the AI response is returned. (If the audio and video-generation features
            are enabled in a future release, any assets they generate would be held only temporarily
            while you complete your export, then discarded.) Your anonymous ID and export count
            remain on your device until you delete the app or clear your browser data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">Account deletion (iOS)</h2>
          <p>
            In the iOS app, go to <strong>Settings → Delete All Data</strong> to permanently
            remove your anonymous ID, project history, and all locally stored data. This cannot
            be undone.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">Children</h2>
          <p>
            Highlight Magic is not directed to children under 13. We do not knowingly collect
            any information from children under 13.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">Changes to this policy</h2>
          <p>
            We may update this policy as the product evolves. Material changes will be noted by
            updating the date above. Continued use of the app after an update constitutes
            acceptance of the revised policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">Contact</h2>
          <p>
            Questions about your privacy? Email{" "}
            <a href="mailto:privacy@highlightmagic.app" className="text-[var(--accent)] underline">
              privacy@highlightmagic.app
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
