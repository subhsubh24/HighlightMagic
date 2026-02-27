import Foundation
import CoreMedia

struct HighlightSegment: Identifiable, Hashable, Sendable {
    let id: UUID
    let startTime: CMTime
    let endTime: CMTime
    var confidenceScore: Double
    var label: String
    var detectionSources: [DetectionSource]

    init(
        id: UUID = UUID(),
        startTime: CMTime,
        endTime: CMTime,
        confidenceScore: Double,
        label: String = "",
        detectionSources: [DetectionSource] = []
    ) {
        self.id = id
        self.startTime = startTime
        self.endTime = endTime
        self.confidenceScore = confidenceScore
        self.label = label
        self.detectionSources = detectionSources
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
