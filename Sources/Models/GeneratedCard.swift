import Foundation

/// AI-generated intro or outro video card — matches web `GeneratedCard` type.
struct GeneratedCard: Sendable {
    var text: String
    var stylePrompt: String
    var videoUrl: URL?
    /// AI-decided duration in seconds (3-5s range)
    var duration: Double
    var status: GenerationStatus
}
