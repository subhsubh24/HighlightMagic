import Foundation

/// App Store Connect metadata — ASO-optimized for launch
enum AppStoreMetadata {
    static let appName = "Highlight Magic"
    static let subtitle = "AI Video Highlights Maker"
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
    • Advanced multi-pass AI with Claude Vision refinement
    • Premium cinematic effects & LUTs
    • iCloud project sync across devices
    • Priority processing
    """

    // Max 100 chars, comma-separated — high-volume ASO keywords
    static let keywords = "video highlights,AI video editor,Reels maker,TikTok editor,short clips,auto edit,highlight reel,vertical video,video trimmer,social media clips"

    static let promotionalText = "Now with 8 style templates, interactive trim editor, and premium cinematic effects!"

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

    // Screenshot captions for App Store listing (5.5" and 6.7")
    static let screenshotCaptions = [
        "Pick a video and describe the highlights you want",
        "AI analyzes motion, faces & scenes in real time",
        "Choose from 8 curated style templates",
        "Trim, add music, captions & professional filters",
        "Export vertical clips ready for TikTok & Reels",
        "Unlock Pro for unlimited exports & premium effects",
        "Sync projects across devices with iCloud",
        "Privacy-first: all processing stays on your device"
    ]

    // Review notes for App Store submission
    static let reviewNotes = """
    - This app uses on-device AI (Vision framework, Core ML) for video analysis. \
    No video data is sent to external servers during detection.
    - Claude Vision API is an optional enhancement for Pro users only, activated \
    when confidence is low and the user has configured an API key.
    - Subscription auto-renewal and cancellation follow standard StoreKit 2 patterns.
    - The app does not collect any personally identifiable information. \
    An anonymous UUID is generated locally for project sync.
    - All music tracks are royalty-free and licensed for inclusion.
    """
}
