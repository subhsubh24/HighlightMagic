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
    Turn your raw personal videos into share-ready short highlights in seconds — powered by on-device AI.

    Highlight Magic automatically finds the best moments in your videos using smart motion, face, and scene detection. No cloud uploads. No editing experience needed. Just pick a video, and we do the rest.

    SMART AI HIGHLIGHT DETECTION
    Our multi-pass AI pipeline analyzes every frame for motion intensity, facial expressions, scene composition, and visual interest. Tell us what you're looking for — "funny pet reactions", "epic hiking views", "best dance moves" — and we prioritize exactly those moments.

    READY FOR TIKTOK, REELS & SHORTS
    Every clip exports in vertical 1080×1920 MP4 format, perfectly sized for TikTok, Instagram Reels, YouTube Shorts, and Snapchat Spotlight. Share directly from the app with one tap.

    STYLE TEMPLATES & FILTERS
    Choose from 8 curated style templates — Adventure, Foodie, Fitness, Pet Vibes, Travel, Daily Life, Gaming, and Party. Each template auto-applies the perfect filter, caption style, and music mood.

    INTERACTIVE CLIP EDITOR
    Fine-tune your highlights with a gesture-based trim slider, live video preview, custom captions, 14 royalty-free music tracks, and 6 professional filters. Premium users unlock cinematic LUTs, particle overlays, and exclusive effects.

    PRIVACY-FIRST
    All video analysis happens 100% on your device using Apple's Vision framework and Core ML. Your videos never leave your phone.

    FREE PLAN INCLUDES:
    • 5 exports per month
    • 5 royalty-free music tracks
    • Smart AI detection
    • All 8 style templates

    HIGHLIGHT MAGIC PRO ($4.99/mo or $39.99/yr — save 33%):
    • Unlimited exports
    • No watermark
    • 14+ premium music tracks
    • Advanced multi-pass AI detection
    • Premium cinematic effects & LUTs
    • iCloud project sync across devices
    • Priority processing
    """

    // Max 100 chars — high-volume, no spaces after commas to maximize keyword density
    static let keywords = "video highlights,AI video editor,Reels maker,TikTok editor,short clips,auto edit,highlight reel,vertical video,clip maker,video trim"

    static let promotionalText = "Turn raw footage into viral Reels in seconds — now with 8 style templates and premium cinematic effects!"

    static let whatsNew = """
    v1.0.0 — Launch!
    • Smart multi-pass highlight detection with on-device AI
    • 8 curated style templates (Adventure, Foodie, Fitness & more)
    • Interactive gesture-based trim editor with live preview
    • 14 royalty-free music tracks across 6 categories
    • Export optimized for TikTok, Reels, and Shorts
    • Premium effects: cinematic LUTs, particle overlays
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
            headline: "7-Pass AI Analyzes Every Frame",
            subtitle: "Motion, faces, scenes — nothing missed",
            screenContent: "Processing screen → animated progress ring at 65% → 'Pass 4: AI video-text matching...' label"
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
            headline: "14 Royalty-Free Tracks, 8 Styles",
            subtitle: "Match the mood to your content",
            screenContent: "Music picker → 'Golden Hour' selected → Adventure template card highlighted"
        ),
        (
            headline: "Export Ready For TikTok & Reels",
            subtitle: "1080×1920 MP4, one-tap share",
            screenContent: "Export complete screen → green checkmark → 'Share' button → 'Made with Highlight Magic' badge"
        ),
        (
            headline: "Your Videos Never Leave Your Phone",
            subtitle: "100% on-device AI, privacy-first design",
            screenContent: "Settings screen → Privacy Policy link → 'All processing stays on device' banner → lock icon"
        )
    ]

    // Legacy simple captions (for programmatic access)
    static let screenshotCaptions: [String] = screenshotDescriptions.map(\.headline)

    // MARK: - Review Notes

    static let reviewNotes = """
    AI DISCLOSURE:
    - This app uses Apple Vision framework and Core ML for on-device video analysis. \
    All AI processing happens locally on the user's device.
    - An optional third-party AI enhancement (Anthropic Claude Vision API) is available \
    only when the user explicitly configures their own API key in Settings > AI Settings. \
    This feature sends individual video frames (not full videos) to the Anthropic API \
    for scoring only when on-device confidence is below 60%. No data is sent without \
    user configuration, and the feature works fully without it.
    - The app does NOT use generative AI to create synthetic content. \
    AI is used solely to identify and rank existing video frames by highlight potential.

    SUBSCRIPTION:
    - Auto-renewable subscriptions: pro.monthly ($4.99/mo), pro.yearly ($39.99/yr).
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
    - All music tracks are original royalty-free compositions licensed for in-app use.
    - No user-generated content sharing between users.
    - Content rating 4+: no objectionable content.
    """
}
