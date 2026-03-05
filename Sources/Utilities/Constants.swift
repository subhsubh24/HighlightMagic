import Foundation
import CoreMedia

enum Constants {
    static let maxVideoDurationSeconds: TimeInterval = 600 // 10 minutes
    static let freeExportLimit = 5
    static let minClipDuration: TimeInterval = 2    // Matches web — allows punchy rhythm cuts
    static let maxClipDuration: TimeInterval = 60
    static let targetClipCount = 8                  // Offline fallback only — cloud path lets Opus decide (no cap, matches web)
    static let exportWidth: Int = 1080
    static let exportHeight: Int = 1920
    static let exportBitRate: Int = 12_000_000      // Matches web — 12 Mbps preserves detail through platform recompression
    static let exportFrameRate: Int = 30
    static let highlightConfidenceThreshold: Double = 0.6

    static let watermarkText = "Highlight Magic"
    static let watermarkOpacity: Double = 0.4

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
