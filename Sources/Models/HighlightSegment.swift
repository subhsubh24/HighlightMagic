import Foundation
import CoreMedia

struct HighlightSegment: Identifiable, Hashable, Sendable {
    let id: UUID
    var startTime: CMTime
    var endTime: CMTime
    var confidenceScore: Double
    var label: String
    var detectionSources: [DetectionSource]

    /// AI-suggested optimal trim points (from Claude Vision).
    /// When present, these refine the raw detection boundaries
    /// to better frame the actual highlight content.
    var aiSuggestedStart: CMTime?
    var aiSuggestedEnd: CMTime?

    init(
        id: UUID = UUID(),
        startTime: CMTime,
        endTime: CMTime,
        confidenceScore: Double,
        label: String = "",
        detectionSources: [DetectionSource] = [],
        aiSuggestedStart: CMTime? = nil,
        aiSuggestedEnd: CMTime? = nil
    ) {
        self.id = id
        self.startTime = startTime
        self.endTime = endTime
        self.confidenceScore = confidenceScore
        self.label = label
        self.detectionSources = detectionSources
        self.aiSuggestedStart = aiSuggestedStart
        self.aiSuggestedEnd = aiSuggestedEnd
    }

    /// The best available start time: AI-suggested if available, otherwise raw detection boundary.
    var effectiveStartTime: CMTime {
        aiSuggestedStart ?? startTime
    }

    /// The best available end time: AI-suggested if available, otherwise raw detection boundary.
    var effectiveEndTime: CMTime {
        aiSuggestedEnd ?? endTime
    }

    /// Duration using the best available trim points.
    var effectiveDuration: TimeInterval {
        CMTimeGetSeconds(effectiveEndTime) - CMTimeGetSeconds(effectiveStartTime)
    }

    // Explicit Hashable based on id only — mutable vars (confidenceScore, label,
    // detectionSources) must not participate in hashing or equality, otherwise
    // mutating a segment after inserting it into a Set/Dictionary corrupts the collection.
    static func == (lhs: HighlightSegment, rhs: HighlightSegment) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    var duration: TimeInterval {
        CMTimeGetSeconds(endTime) - CMTimeGetSeconds(startTime)
    }

    var startSeconds: Double {
        CMTimeGetSeconds(startTime)
    }

    var endSeconds: Double {
        CMTimeGetSeconds(endTime)
    }

    var timeRangeDescription: String {
        let start = formatTime(startSeconds)
        let end = formatTime(endSeconds)
        return "\(start) – \(end)"
    }

    private func formatTime(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

enum DetectionSource: String, Hashable, CaseIterable, Sendable {
    case visionMotion = "Motion Analysis"
    case visionFace = "Face Detection"
    case visionScene = "Scene Classification"
    case foundationModel = "AI Semantic"
    case coreMl = "ML Model"
    case claudeVision = "Cloud AI"
}
