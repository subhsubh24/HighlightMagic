import Foundation
import AVFoundation
import CoreImage
import UIKit

actor ClipGenerationService {
    static let shared = ClipGenerationService()

    private init() {}

    func generateClips(
        from video: VideoItem,
        segments: [HighlightSegment]
    ) -> [EditedClip] {
        segments.map { segment in
            EditedClip(
                sourceVideoID: video.id,
                segment: segment,
                selectedMusicTrack: MusicLibrary.tracks.first,
                captionText: segment.label
            )
        }
    }
}

actor ExportService {
    static let shared = ExportService()

    private init() {}

    struct ExportConfig {
        let sourceURL: URL
        let trimStart: CMTime
        let trimEnd: CMTime
        let filter: VideoFilter
        let captionText: String
        let captionStyle: CaptionStyle
        let musicTrack: MusicTrack?
        let addWatermark: Bool
        let outputSize: CGSize

        static var defaultSize: CGSize {
            CGSize(
                width: Constants.exportWidth,
                height: Constants.exportHeight
            )
        }
    }

    func exportClip(
        config: ExportConfig,
        progressHandler: @Sendable (Double) -> Void
    ) async throws -> URL {
        let asset = AVURLAsset(url: config.sourceURL)
        let composition = AVMutableComposition()

        // 1. Add video track
        let timeRange = CMTimeRange(start: config.trimStart, end: config.trimEnd)

        guard let sourceVideoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            throw ExportError.noVideoTrack
        }

        let compositionVideoTrack = composition.addMutableTrack(
            withMediaType: .video,
            preferredTrackID: kCMPersistentTrackID_Invalid
        )!

        try compositionVideoTrack.insertTimeRange(
            timeRange,
            of: sourceVideoTrack,
            at: .zero
        )
        progressHandler(0.10)

        // 2. Add original audio track
        if let sourceAudioTrack = try await asset.loadTracks(withMediaType: .audio).first {
            let compositionAudioTrack = composition.addMutableTrack(
                withMediaType: .audio,
                preferredTrackID: kCMPersistentTrackID_Invalid
            )!

            try compositionAudioTrack.insertTimeRange(
                timeRange,
                of: sourceAudioTrack,
                at: .zero
            )
        }
        progressHandler(0.20)

        // 3. Add music track if selected
        if let musicTrack = config.musicTrack, let musicURL = musicTrack.bundleURL {
            let musicAsset = AVURLAsset(url: musicURL)
            if let musicAudioTrack = try? await musicAsset.loadTracks(withMediaType: .audio).first {
                let musicCompositionTrack = composition.addMutableTrack(
                    withMediaType: .audio,
                    preferredTrackID: kCMPersistentTrackID_Invalid
                )!

                let clipDuration = CMTimeSubtract(config.trimEnd, config.trimStart)
                let musicDuration = try await musicAsset.load(.duration)
                let musicRange = CMTimeRange(
                    start: .zero,
                    duration: min(clipDuration, musicDuration)
                )

                try? musicCompositionTrack.insertTimeRange(
                    musicRange,
                    of: musicAudioTrack,
                    at: .zero
                )
            }
        }
        progressHandler(0.30)

        // 4. Build video composition for filters/watermark/captions
        let videoComposition = try await buildVideoComposition(
            composition: composition,
            sourceTrack: sourceVideoTrack,
            config: config
        )
        progressHandler(0.40)

        // 5. Export
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("highlight_\(UUID().uuidString)")
            .appendingPathExtension("mp4")

        guard let exportSession = AVAssetExportSession(
            asset: composition,
            presetName: AVAssetExportPresetHighestQuality
        ) else {
            throw ExportError.exportSessionCreationFailed
        }

        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.videoComposition = videoComposition
        exportSession.shouldOptimizeForNetworkUse = true

        // Progress polling
        let progressTask = Task { @Sendable in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(250))
                let progress = 0.40 + Double(exportSession.progress) * 0.55
                progressHandler(progress)
            }
        }

        await exportSession.export()
        progressTask.cancel()

        guard exportSession.status == .completed else {
            throw ExportError.exportFailed(
                exportSession.error?.localizedDescription ?? "Unknown error"
            )
        }

        progressHandler(1.0)
        return outputURL
    }

    private func buildVideoComposition(
        composition: AVMutableComposition,
        sourceTrack: AVAssetTrack,
        config: ExportConfig
    ) async throws -> AVMutableVideoComposition {
        let naturalSize = try await sourceTrack.load(.naturalSize)
        let preferredTransform = try await sourceTrack.load(.preferredTransform)

        // Determine actual video dimensions accounting for transform
        let isPortrait = abs(preferredTransform.b) == 1.0
        let videoWidth = isPortrait ? naturalSize.height : naturalSize.width
        let videoHeight = isPortrait ? naturalSize.width : naturalSize.height

        let targetSize = config.outputSize
        let videoComposition = AVMutableVideoComposition()
        videoComposition.renderSize = targetSize
        videoComposition.frameDuration = CMTime(value: 1, timescale: Int32(Constants.exportFrameRate))

        // Instruction
        let instruction = AVMutableVideoCompositionInstruction()
        let clipDuration = CMTimeSubtract(config.trimEnd, config.trimStart)
        instruction.timeRange = CMTimeRange(start: .zero, duration: clipDuration)

        if let compositionTrack = composition.tracks(withMediaType: .video).first {
            let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compositionTrack)

            // Scale to fill vertical frame (center crop)
            let scaleX = targetSize.width / videoWidth
            let scaleY = targetSize.height / videoHeight
            let scale = max(scaleX, scaleY)

            let scaledWidth = videoWidth * scale
            let scaledHeight = videoHeight * scale
            let offsetX = (targetSize.width - scaledWidth) / 2
            let offsetY = (targetSize.height - scaledHeight) / 2

            var transform = preferredTransform
            transform = transform.concatenating(CGAffineTransform(scaleX: scale, y: scale))
            transform = transform.concatenating(CGAffineTransform(translationX: offsetX, y: offsetY))

            layerInstruction.setTransform(transform, at: .zero)
            instruction.layerInstructions = [layerInstruction]
        }

        videoComposition.instructions = [instruction]

        // Apply CIFilter if needed
        if let filterName = config.filter.ciFilterName {
            videoComposition.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
            videoComposition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
            videoComposition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2

            let ciFilter = CIFilter(name: filterName)

            if let filter = ciFilter {
                for (key, value) in config.filter.filterParameters {
                    filter.setValue(value, forKey: key)
                }
            }
        }

        // Add text overlay layers (caption + watermark)
        addOverlayLayers(
            to: videoComposition,
            size: targetSize,
            captionText: config.captionText,
            captionStyle: config.captionStyle,
            addWatermark: config.addWatermark
        )

        return videoComposition
    }

    private func addOverlayLayers(
        to videoComposition: AVMutableVideoComposition,
        size: CGSize,
        captionText: String,
        captionStyle: CaptionStyle,
        addWatermark: Bool
    ) {
        let parentLayer = CALayer()
        parentLayer.frame = CGRect(origin: .zero, size: size)

        let videoLayer = CALayer()
        videoLayer.frame = CGRect(origin: .zero, size: size)
        parentLayer.addSublayer(videoLayer)

        // Caption overlay
        if !captionText.isEmpty {
            let captionLayer = CATextLayer()
            captionLayer.string = captionText
            captionLayer.fontSize = captionStyle.fontSize * 2 // Retina
            captionLayer.foregroundColor = UIColor.white.cgColor
            captionLayer.backgroundColor = UIColor.black.withAlphaComponent(0.5).cgColor
            captionLayer.cornerRadius = 8
            captionLayer.alignmentMode = .center
            captionLayer.contentsScale = UIScreen.main.scale

            let captionWidth = size.width * 0.8
            let captionHeight: CGFloat = 80
            captionLayer.frame = CGRect(
                x: (size.width - captionWidth) / 2,
                y: size.height * 0.12,
                width: captionWidth,
                height: captionHeight
            )
            parentLayer.addSublayer(captionLayer)
        }

        // Watermark
        if addWatermark {
            let watermarkLayer = CATextLayer()
            watermarkLayer.string = Constants.watermarkText
            watermarkLayer.fontSize = 24
            watermarkLayer.foregroundColor = UIColor.white.withAlphaComponent(
                CGFloat(Constants.watermarkOpacity)
            ).cgColor
            watermarkLayer.alignmentMode = .right
            watermarkLayer.contentsScale = UIScreen.main.scale
            watermarkLayer.frame = CGRect(
                x: size.width - 250,
                y: 20,
                width: 230,
                height: 40
            )
            parentLayer.addSublayer(watermarkLayer)
        }

        videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(
            postProcessingAsVideoLayer: videoLayer,
            in: parentLayer
        )
    }
}

enum ExportError: LocalizedError {
    case noVideoTrack
    case exportSessionCreationFailed
    case exportFailed(String)

    var errorDescription: String? {
        switch self {
        case .noVideoTrack: "No video track found in the source."
        case .exportSessionCreationFailed: "Could not create export session."
        case .exportFailed(let msg): "Export failed: \(msg)"
        }
    }
}
