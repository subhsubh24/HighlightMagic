import Foundation
import CoreMedia

enum Constants {
    static let maxVideoDurationSeconds: TimeInterval = 600 // 10 minutes
    static let maxUploadSizeMB: Int = 500                  // Matches web MAX_UPLOAD_SIZE_MB
    static let maxFiles: Int = 100                         // Matches web MAX_FILES
    static let maxTotalDurationSeconds: TimeInterval = 1800 // 30 min total across all clips — matches web
    static let freeExportLimit = 5
    static let minClipDuration: TimeInterval = 2           // Matches web — allows punchy rhythm cuts
    static let maxClipDuration: TimeInterval = 60
    static let targetClipCount = 8                         // Offline fallback only — cloud path lets Sonnet 4.6 decide (no cap, matches web)
    static let exportWidth: Int = 1080
    static let exportHeight: Int = 1920
    static let exportBitRate: Int = 12_000_000             // Matches web — 12 Mbps preserves detail through platform recompression
    static let exportFrameRate: Int = 30
    static let highlightConfidenceThreshold: Double = 0.6

    static let watermarkText = "Highlight Magic"
    static let watermarkOpacity: Double = 0.38             // Aligned with web (was 0.4)

    // ── Frame extraction (parity with web) ──
    static let frameSampleIntervalSeconds: Double = 1      // Extract 1 frame per second — miss nothing
    static let maxFramesPerBatch: Int = 35                 // 35 frames/batch for Haiku scoring

    // ── Viral features (parity with web) ──
    static let photoDisplayDuration: Double = 3.2          // Seconds a photo shows in the final edit
    static let loopCrossfadeDuration: Double = 0.47        // Seconds of crossfade for seamless loop
    static let beatSyncToleranceMs: Int = 47               // Max ms off-beat before snapping
    static let transitionDuration: Double = 0.28           // Fallback only — AI overrides per-clip

    enum Animation {
        static let standard: Double = 0.3
        static let slow: Double = 0.5
        static let spring: Double = 0.4
    }

    enum Layout {
        static let cornerRadius: CGFloat = 16
        static let smallCornerRadius: CGFloat = 8
        static let padding: CGFloat = 16
        static let smallPadding: CGFloat = 8
        static let cardShadowRadius: CGFloat = 8
    }
}
