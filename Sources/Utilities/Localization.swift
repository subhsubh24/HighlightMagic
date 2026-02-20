import Foundation

/// Localization stub for multi-language support.
/// To add a new language:
/// 1. Add a Localizable.strings file for the target locale
/// 2. Replace hardcoded strings with L10n.keyName references
/// 3. Run `genstrings` to extract string keys
enum L10n {
    // MARK: - Common
    static let appName = String(localized: "app.name", defaultValue: "Highlight Magic")
    static let ok = String(localized: "common.ok", defaultValue: "OK")
    static let cancel = String(localized: "common.cancel", defaultValue: "Cancel")
    static let done = String(localized: "common.done", defaultValue: "Done")
    static let error = String(localized: "common.error", defaultValue: "Error")
    static let retry = String(localized: "common.retry", defaultValue: "Try Again")

    // MARK: - Home
    static let chooseVideo = String(localized: "home.choose_video", defaultValue: "Choose Video")
    static let loading = String(localized: "home.loading", defaultValue: "Loading...")
    static let tagline = String(localized: "home.tagline", defaultValue: "Turn your videos into\nshare-ready highlights")

    // MARK: - Prompt
    static let promptTitle = String(localized: "prompt.title", defaultValue: "What should we look for?")
    static let promptHint = String(localized: "prompt.hint", defaultValue: "Describe the highlights you want, or skip for auto-detect")
    static let findHighlights = String(localized: "prompt.find", defaultValue: "Find Highlights")
    static let skipAutoDetect = String(localized: "prompt.skip", defaultValue: "Skip — Auto-detect")

    // MARK: - Processing
    static let preparingVideo = String(localized: "processing.preparing", defaultValue: "Preparing video...")
    static let analyzingMotion = String(localized: "processing.motion", defaultValue: "Pass 1: Analyzing motion...")
    static let detectingFaces = String(localized: "processing.faces", defaultValue: "Pass 2: Detecting faces...")

    // MARK: - Export
    static let exportNow = String(localized: "export.now", defaultValue: "Export Now")
    static let exportComplete = String(localized: "export.complete", defaultValue: "Export Complete!")
    static let share = String(localized: "export.share", defaultValue: "Share")

    // MARK: - Paywall
    static let unlockPro = String(localized: "paywall.unlock", defaultValue: "Unlock Pro")
    static let subscribeNow = String(localized: "paywall.subscribe", defaultValue: "Subscribe Now")
    static let restorePurchases = String(localized: "paywall.restore", defaultValue: "Restore Purchases")

    // MARK: - Errors
    static let videoTooLong = String(localized: "error.video_too_long", defaultValue: "Video must be 10 minutes or shorter.")
    static let noConnection = String(localized: "error.no_connection", defaultValue: "No internet connection. Some features may be limited.")

    // MARK: - Accessibility
    static func highlightLabel(_ name: String, duration: Int) -> String {
        String(localized: "accessibility.highlight_label \(name) \(duration)",
               defaultValue: "Highlight: \(name), \(duration) seconds")
    }

    static func exportCounter(used: Int, limit: Int) -> String {
        String(localized: "accessibility.export_counter \(used) \(limit)",
               defaultValue: "\(used) of \(limit) free exports used")
    }
}
