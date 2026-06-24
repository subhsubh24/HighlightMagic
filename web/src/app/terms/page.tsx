export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold text-white">Terms of Use</h1>
      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-[var(--text-secondary)]">
        <p className="text-sm text-[var(--text-tertiary)]">Last updated: June 2026</p>

        <section>
          <h2 className="text-lg font-semibold text-white">1. Agreement to Terms</h2>
          <p>
            By downloading, installing, or using Highlight Magic (&quot;we&quot;, &quot;our&quot;,
            &quot;the Service&quot;), you agree to be bound by these Terms of Use. If you do not
            agree, do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">2. Description of Service</h2>
          <p>
            Highlight Magic is an AI-powered video highlight tool available as an iOS app and web
            application. It analyzes your video footage using AI to automatically find and clip the
            best moments, then lets you edit, stylize, and export short vertical clips optimized for
            TikTok, Instagram Reels, and YouTube Shorts.
          </p>
          <p className="mt-2">
            The web application processes video on our servers via third-party AI providers
            (Anthropic, ElevenLabs, AtlasCloud). The iOS app uses a bring-your-own-key (BYOK)
            model: you provide your own Anthropic API key in Settings, and AI analysis is performed
            via your API account. No frames or video data are stored by Highlight Magic beyond the
            duration of your session.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">3. Free and Pro Plans</h2>
          <p>Highlight Magic offers two service tiers:</p>
          <ul className="list-disc space-y-2 pl-5 mt-2">
            <li>
              <strong className="text-white">Free Plan</strong> &mdash; 5 exports per month;
              exported clips include a Highlight Magic watermark. No account or payment required.
            </li>
            <li>
              <strong className="text-white">Pro Plan</strong> &mdash; unlimited exports, no
              watermark, and access to premium features. Available as a monthly or yearly
              auto-renewable subscription via the Apple App Store. Subscription terms are governed
              by Apple&apos;s standard subscription policies. Cancel anytime via your Apple ID
              subscription settings.
            </li>
          </ul>
          <p className="mt-2">
            We reserve the right to change pricing with reasonable notice. Current pricing is
            displayed in the app before purchase.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">4. Your Content</h2>
          <p>
            You retain all ownership rights to the videos and photos you process through Highlight
            Magic. By using the Service, you grant us a limited, temporary license to process your
            content solely for the purpose of delivering the Service to you &mdash; for example,
            sending video frames to our AI providers to generate your highlight reel.
          </p>
          <p className="mt-2">
            You represent that you have all rights necessary to submit your content for processing.
            Do not submit content you do not own or have permission to use.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">5. Acceptable Use</h2>
          <p>You may not use Highlight Magic to:</p>
          <ul className="list-disc space-y-1 pl-5 mt-2">
            <li>Process or distribute content that is illegal, harmful, or violates third-party rights.</li>
            <li>Attempt to reverse-engineer or extract the AI models or backend services.</li>
            <li>Circumvent technical measures that limit free-tier export counts.</li>
            <li>Use the Service in any way that violates applicable laws or regulations.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">6. Third-Party API Keys (iOS)</h2>
          <p>
            The iOS app uses a bring-your-own-key model. When you provide an Anthropic API key,
            you are subject to Anthropic&apos;s terms of service and are solely responsible for
            any costs incurred on your account. Highlight Magic does not charge for third-party
            API usage; those costs accrue directly to your API account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">7. Disclaimer of Warranties</h2>
          <p>
            The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranty
            of any kind, express or implied. We do not guarantee that the Service will be
            uninterrupted, error-free, or that AI-generated highlights will meet your expectations.
            AI output quality varies and is not guaranteed.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">8. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, Highlight Magic shall not be liable
            for any indirect, incidental, special, or consequential damages arising from your use
            of the Service, including but not limited to loss of data or loss of content. Our total
            liability shall not exceed the amount you paid for the Service in the twelve months
            preceding the claim.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">9. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Material changes will be noted by updating
            the date above. Continued use of the Service after changes are posted constitutes
            acceptance of the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">10. Contact</h2>
          <p>
            Questions about these Terms? Email{" "}
            <a
              href="mailto:support@highlightmagic.app"
              className="text-[var(--accent)] underline"
            >
              support@highlightmagic.app
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
