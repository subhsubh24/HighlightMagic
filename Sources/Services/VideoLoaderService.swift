import Foundation
import Photos
import AVFoundation
import UIKit

actor VideoLoaderService {
    static let shared = VideoLoaderService()

    private init() {}

    func loadVideo(from phAsset: PHAsset) async throws -> VideoItem {
        let url = try await exportAssetToTemp(phAsset)
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration)
        return VideoItem(
            sourceURL: url,
            phAsset: phAsset,
            duration: CMTimeGetSeconds(duration),
            creationDate: phAsset.creationDate,
            thumbnailTime: CMTime(seconds: 1, preferredTimescale: 600)
        )
    }

    func loadVideo(from url: URL) async throws -> VideoItem {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration)
        return VideoItem(
            sourceURL: url,
            duration: CMTimeGetSeconds(duration),
            thumbnailTime: CMTime(seconds: 1, preferredTimescale: 600)
        )
    }

    private func exportAssetToTemp(_ phAsset: PHAsset) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let options = PHVideoRequestOptions()
            options.version = .current
            options.deliveryMode = .highQualityFormat
            options.isNetworkAccessAllowed = true

            PHImageManager.default().requestAVAsset(
                forVideo: phAsset,
                options: options
            ) { avAsset, _, info in
                guard let urlAsset = avAsset as? AVURLAsset else {
                    if let avAsset = avAsset {
                        let tempURL = FileManager.default.temporaryDirectory
                            .appendingPathComponent(UUID().uuidString)
                            .appendingPathExtension("mov")

                        guard let exportSession = AVAssetExportSession(
                            asset: avAsset,
                            presetName: AVAssetExportPresetHighestQuality
                        ) else {
                            continuation.resume(throwing: VideoLoaderError.exportFailed)
                            return
                        }
                        exportSession.outputURL = tempURL
                        exportSession.outputFileType = .mov

                        exportSession.exportAsynchronously {
                            if exportSession.status == .completed {
                                continuation.resume(returning: tempURL)
                            } else {
                                continuation.resume(
                                    throwing: VideoLoaderError.exportFailed
                                )
                            }
                        }
                        return
                    }
                    continuation.resume(throwing: VideoLoaderError.assetNotFound)
                    return
                }
                continuation.resume(returning: urlAsset.url)
            }
        }
    }

    func generateThumbnail(for url: URL, at time: CMTime, size: CGSize) async -> UIImage? {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = size

        do {
            let (cgImage, _) = try await generator.image(at: time)
            return UIImage(cgImage: cgImage)
        } catch {
            return nil
        }
    }
}

enum VideoLoaderError: LocalizedError {
    case assetNotFound
    case exportFailed
    case durationExceeded

    var errorDescription: String? {
        switch self {
        case .assetNotFound: "Could not load the selected video."
        case .exportFailed: "Failed to export video from Photos library."
        case .durationExceeded: "Video exceeds the 10-minute limit."
        }
    }
}
