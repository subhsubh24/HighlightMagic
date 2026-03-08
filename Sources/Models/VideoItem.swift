import Foundation
import Photos
import AVFoundation

struct VideoItem: Identifiable, Hashable, Sendable {
    let id: UUID
    let sourceURL: URL
    /// PHAsset is not Sendable but is only accessed from the main actor for
    /// photo library operations. Using nonisolated(unsafe) documents this
    /// contract explicitly rather than blanket @unchecked Sendable on the struct.
    nonisolated(unsafe) let phAsset: PHAsset?
    let duration: TimeInterval
    let creationDate: Date?
    let thumbnailTime: CMTime

    init(
        id: UUID = UUID(),
        sourceURL: URL,
        phAsset: PHAsset? = nil,
        duration: TimeInterval,
        creationDate: Date? = nil,
        thumbnailTime: CMTime = .zero
    ) {
        self.id = id
        self.sourceURL = sourceURL
        self.phAsset = phAsset
        self.duration = duration
        self.creationDate = creationDate
        self.thumbnailTime = thumbnailTime
    }

    static func == (lhs: VideoItem, rhs: VideoItem) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    var formattedDuration: String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    var isWithinLimit: Bool {
        duration <= Constants.maxVideoDurationSeconds
    }
}
