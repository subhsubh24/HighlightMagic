import Foundation
import AVFoundation

enum InputValidation {

    enum VideoValidationError: LocalizedError {
        case durationTooLong(actual: TimeInterval, limit: TimeInterval)
        case unsupportedFormat(String)
        case fileNotFound
        case noVideoTrack
        case corruptedFile

        var errorDescription: String? {
            switch self {
            case .durationTooLong(let actual, let limit):
                let mins = Int(actual) / 60
                let maxMins = Int(limit) / 60
                return "Video is \(mins) minutes long. Maximum is \(maxMins) minutes."
            case .unsupportedFormat(let ext):
                return "Unsupported video format: .\(ext). Please use MOV, MP4, or M4V."
            case .fileNotFound:
                return "Video file could not be found."
            case .noVideoTrack:
                return "This file doesn't contain a video track."
            case .corruptedFile:
                return "The video file appears to be corrupted."
            }
        }
    }

    static let supportedFormats: Set<String> = ["mov", "mp4", "m4v", "avi", "mkv"]

    static func validateVideo(at url: URL) async throws {
        // Check file exists
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw VideoValidationError.fileNotFound
        }

        // Check format
        let ext = url.pathExtension.lowercased()
        guard supportedFormats.contains(ext) else {
            throw VideoValidationError.unsupportedFormat(ext)
        }

        // Check asset is valid
        let asset = AVURLAsset(url: url)

        // Check for video track
        let videoTracks = try await asset.loadTracks(withMediaType: .video)
        guard !videoTracks.isEmpty else {
            throw VideoValidationError.noVideoTrack
        }

        // Check duration
        let duration = try await asset.load(.duration)
        let seconds = CMTimeGetSeconds(duration)
        guard seconds > 0 else {
            throw VideoValidationError.corruptedFile
        }
        guard seconds <= Constants.maxVideoDurationSeconds else {
            throw VideoValidationError.durationTooLong(
                actual: seconds,
                limit: Constants.maxVideoDurationSeconds
            )
        }
    }

    static func validatePrompt(_ prompt: String) -> String {
        // Trim whitespace and limit length
        let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count > 200 {
            return String(trimmed.prefix(200))
        }
        return trimmed
    }
}
