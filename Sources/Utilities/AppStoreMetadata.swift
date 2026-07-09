import Foundation

/// App Store Connect metadata — ASO-optimized for launch
enum AppStoreMetadata {
    static let appName = "Highlight Magic"
    static let subtitle = "AI Video Highlights in Seconds"  // Action-oriented, includes "AI" + "Highlights"
    static let bundleID = "com.highlightmagic.app"
    static let sku = "HIGHLIGHT_MAGIC_001"
    static let primaryCategory = "Photo & Video"
    static let secondaryCategory = "Entertainment"
    static let contentRating = "4+"
    static let copyright = "2026 Highlight Magic"

    static let description = """
    Turn your raw personal videos into share-ready short highlights in seconds — powered by AI.

    Highlight Magic automatically finds the best moments in your videos using smart motion, face, and scene detection. No editing experience needed. Just pick a video, and we do the rest.

    SMART AI HIGHLIGHT DETECTION
    Our multi-pass AI pipeline analyzes every frame for motion intensity, facial expressions, scene composition, and visual interest. Tell us what you're looking for — "funny pet reactions", "epic hiking views", "best dance moves" — and we prioritize exactly those moments.

    READY FOR TIKTOK, REELS & SHORTS
    Every clip exports in vertical 1080×1920 MP4 format, perfectly sized for TikTok, Instagram Reels, YouTube Shorts, and Snapchat Spotlight. Share directly from the app with one tap.

    STYLE TEMPLATES & FILTERS
    Choose from 8 curated style templates — Adventure, Foodie, Fitness, Pet Vibes, Travel, Daily Life, Gaming, and Party. Each template auto-applies a matching filter and caption style.

    INTERACTIVE CLIP EDITOR
    Fine-tune your highlights with a gesture-based trim slider, live video preview, kinetic captions, and color filters. Premium users unlock the full set of filters and effects.

    CLOUD-POWERED, PRIVACY-MINDED
    AI highlight detection is powered by our backend — individual video frames (sampled at ~1 fps, downscaled to 512 px) are sent automatically to our servers and then to Anthropic Claude for scoring. Full videos are never uploaded; only sampled frames leave your device. When offline, the app falls back to basic on-device detection. No API key setup required — the service is included with your subscription.

    FREE PLAN INCLUDES:
    • 5 exports per month (with a small watermark)
    • Smart AI detection
    • All 8 style templates
    • Kinetic captions & color filters

    HIGHLIGHT MAGIC PRO ($14.99/mo or $149.99/yr — save 17%):
    • Unlimited monthly exports (a 50-per-day fair-use ceiling applies to all tiers)
    • No watermark
    • Advanced multi-pass AI detection
    • Premium filters & effects
    • iCloud project sync across devices
    """

    // Max 100 chars — high-volume, no spaces after commas to maximize keyword density
    static let keywords = "video highlights,AI video editor,Reels maker,TikTok editor,short clips,auto edit,highlight reel,vertical video,clip maker,video trim"

    static let promotionalText = "Turn raw footage into viral Reels in seconds — now with 8 style templates and premium cinematic effects!"

    static let whatsNew = """
    v1.0.0 — Launch!
    • Smart multi-pass highlight detection (cloud-powered via our backend + Anthropic Claude; on-device fallback when offline)
    • 8 curated style templates (Adventure, Foodie, Fitness & more)
    • Interactive gesture-based trim editor with live preview
    • Kinetic captions and color filters
    • Export optimized for TikTok, Reels, and Shorts
    • Premium filters & effects for Pro subscribers
    • iCloud project sync for Pro users
    """

    static let privacyPolicyURL = "https://highlightmagic.app/privacy"
    static let termsOfServiceURL = "https://highlightmagic.app/terms"
    static let supportURL = "https://highlightmagic.app/support"
    static let marketingURL = "https://highlightmagic.app"

    // MARK: - Screenshot Descriptions (Benefit-Focused, 8 Screens)
    // Each has a headline + subtitle for the actual screenshot frame

    static let screenshotDescriptions: [(headline: String, subtitle: String, screenContent: String)] = [
        (
            headline: "Turn Raw Hike Footage Into Viral Reels",
            subtitle: "AI finds your best moments automatically",
            screenContent: "Home screen → user taps 'Choose Video' → shows photo library picker with a hiking video selected"
        ),
        (
            headline: "Tell It What To Look For",
            subtitle: "Or skip and let AI decide",
            screenContent: "Prompt screen → 'epic scenery' typed → suggestion chips shown → 'Find Highlights' button"
        ),
        (
            headline: "6-Pass AI Analyzes Every Frame",
            subtitle: "Motion, faces, scenes — nothing missed",
            screenContent: "Processing screen → animated progress ring at 50% → 'Pass 4: ML model scoring...' label"
        ),
        (
            headline: "3 Highlights Found In 10 Seconds",
            subtitle: "Ranked by confidence with one-tap templates",
            screenContent: "Results screen → 3 ClipCards with confidence badges (92%, 78%, 71%) → Adventure template selected"
        ),
        (
            headline: "Trim, Filter, Caption — All In One",
            subtitle: "Professional editor, zero learning curve",
            screenContent: "Editor screen → VideoTrimSlider with handles → 'Vibrant' filter active → caption 'Summit Moment'"
        ),
        (
            headline: "8 Style Templates, One Tap",
            subtitle: "Adventure, Foodie, Fitness & more",
            screenContent: "Template picker → Adventure template card highlighted → matching filter + caption style preview"
        ),
        (
            headline: "Export Ready For TikTok & Reels",
            subtitle: "1080×1920 MP4, one-tap share",
            screenContent: "Export complete screen → green checkmark → 'Share' button → 'Made with Highlight Magic' badge"
        ),
        (
            headline: "Cloud AI, Full-Video Privacy",
            subtitle: "Frames analyzed in the cloud — full videos never leave your device",
            screenContent: "Settings screen → 'AI Processing: Cloud-based' indicator → Privacy Policy link → 'Delete All Data' option"
        )
    ]

    // Legacy simple captions (for programmatic access)
    static let screenshotCaptions: [String] = screenshotDescriptions.map(\.headline)

    // MARK: - Review Notes

    static let reviewNotes = """
    AI DISCLOSURE:
    - This app is a business-paid, cloud-first service. Video highlight detection \
    works by automatically sampling frames from the user's video (~1 fps, ~512 px), \
    sending them to our backend, and forwarding them to the Anthropic Claude Vision API \
    for AI scoring. Full videos are never uploaded. When the device is offline, the app \
    falls back to basic on-device detection using Apple Vision / Core ML. No user-supplied \
    API key is required or accepted; there is no API key field in Settings.
    - Editor features in this version (trim, kinetic captions, color filters, and style \
    templates) are deterministic and applied on-device; the app does not use user-supplied \
    generative-AI credentials. The only server-side AI is the frame-scoring detection \
    described above.

    SUBSCRIPTION:
    - Auto-renewable subscriptions: pro.monthly ($14.99/mo), pro.yearly ($149.99/yr).
    - Subscription management and cancellation handled by iOS system Settings.
    - Restore Purchases available on paywall and Settings screens.
    - Privacy Policy and Terms of Use links on paywall screen per Guideline 3.1.2.

    PRIVACY:
    - No personally identifiable information collected.
    - An anonymous UUID is generated locally via Keychain for project sync.
    - NSPrivacyTracking is set to false. No ATT prompt is shown.
    - PrivacyInfo.xcprivacy manifest is included.

    ACCOUNT DELETION:
    - Settings > Data > Delete Account & Data — deletes all saved projects, \
    clears iCloud sync data, resets anonymous user ID per Guideline 5.1.1(v).

    CONTENT:
    - No user-generated content sharing between users.
    - Content rating 4+: no objectionable content.
    """
}
