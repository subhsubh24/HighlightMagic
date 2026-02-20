import Foundation

/// App Store Connect metadata stubs for submission preparation
enum AppStoreMetadata {
    static let appName = "Highlight Magic"
    static let subtitle = "Auto Video Highlights"
    static let bundleID = "com.highlightmagic.app"
    static let sku = "HIGHLIGHT_MAGIC_001"
    static let primaryCategory = "Photo & Video"
    static let secondaryCategory = "Entertainment"

    static let description = """
    Turn your raw personal videos into share-ready short highlights — automatically!

    Highlight Magic uses on-device AI to analyze your videos and find the best moments. Whether it's a hiking summit, a pet's funny reaction, or a cooking win, our smart detection finds it all.

    KEY FEATURES:
    • Smart AI Detection — On-device motion, face, and scene analysis finds highlights instantly
    • Prompt-Guided — Tell us what to look for: "funny cooking fails", "epic scenery", "cute pets"
    • Style Templates — 8 preset looks (Adventure, Foodie, Fitness, Pet Vibes, Travel, and more)
    • Quick Editor — Trim, add captions, pick music, apply filters in seconds
    • Vertical Export — 1080×1920 MP4 optimized for TikTok, Reels, and Shorts
    • Share Directly — One-tap sharing to your favorite social platforms

    FREE PLAN:
    • 5 exports per month
    • 5 royalty-free music tracks
    • Basic AI detection
    • Watermark included

    PRO SUBSCRIPTION ($4.99/mo or $39.99/yr):
    • Unlimited exports
    • No watermark
    • 14+ premium music tracks
    • Advanced AI with multi-pass detection
    • Premium effects, LUTs, and overlays
    • iCloud project sync
    • Priority export queue

    Privacy-first: All video analysis happens on your device. Your videos never leave your phone unless you choose to share.
    """

    static let keywords = "video highlights, short clips, TikTok, Reels, Shorts, video editor, AI video, auto edit, highlights, share, social media, vertical video"

    static let promotionalText = "New: 8 style templates + interactive trim slider + premium effects!"

    static let whatsNew = """
    v1.0.0 — Launch!
    • Smart highlight detection with on-device AI
    • 8 style templates
    • Interactive trim editor with live preview
    • 14 royalty-free music tracks
    • Export optimized for TikTok, Reels, and Shorts
    """

    // Screenshot descriptions for App Store listing
    static let screenshotCaptions = [
        "Choose a video and describe what highlights you want",
        "AI analyzes motion, faces, and scenes to find the best moments",
        "Apply style templates with one tap",
        "Trim, add music, captions, and filters",
        "Export vertical clips ready for social media",
        "Unlock Pro for unlimited exports and premium features"
    ]
}
