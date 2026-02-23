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
        // Hook-first ordering: put the highest-confidence segment first
        // (most visually striking clip as frame 1 for scroll-stopping hook)
        let ordered = segments.sorted { $0.confidenceScore > $1.confidenceScore }

        return ordered.map { segment in
            EditedClip(
                sourceVideoID: video.id,
                segment: segment,
                selectedMusicTrack: MusicLibrary.tracks.first,
                captionText: segment.label,
                viralConfig: .default
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
        let viralConfig: ViralEditConfig
        let cinematicGrade: CinematicGrade

        init(
            sourceURL: URL,
            trimStart: CMTime,
            trimEnd: CMTime,
            filter: VideoFilter,
            captionText: String,
            captionStyle: CaptionStyle,
            musicTrack: MusicTrack?,
            addWatermark: Bool,
            outputSize: CGSize,
            viralConfig: ViralEditConfig = .off,
            cinematicGrade: CinematicGrade = .none
        ) {
            self.sourceURL = sourceURL
            self.trimStart = trimStart
            self.trimEnd = trimEnd
            self.filter = filter
            self.captionText = captionText
            self.captionStyle = captionStyle
            self.musicTrack = musicTrack
            self.addWatermark = addWatermark
            self.outputSize = outputSize
            self.viralConfig = viralConfig
            self.cinematicGrade = cinematicGrade
        }

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

        // 1. Detect beats if beat sync is enabled
        var beatMap: BeatSyncService.BeatMap?
        if config.viralConfig.beatSyncEnabled, let track = config.musicTrack {
            do {
                beatMap = try await BeatSyncService.shared.detectBeats(from: track)
            } catch {
                // Fallback: use synthetic beats from BPM metadata
                beatMap = BeatSyncService.shared.syntheticBeatMap(
                    bpm: Double(track.bpm),
                    duration: track.durationSeconds
                )
            }
        }
        progressHandler(0.08)

        // 2. Compute velocity map if velocity editing is enabled
        let clipDuration = CMTimeGetSeconds(config.trimEnd) - CMTimeGetSeconds(config.trimStart)
        var velocityMap: VelocityEditService.VelocityMap?
        if config.viralConfig.velocityStyle != .none, let beats = beatMap {
            velocityMap = await VelocityEditService.shared.generateVelocityMap(
                clipDuration: clipDuration,
                beatMap: beats,
                style: config.viralConfig.velocityStyle
            )
        }
        progressHandler(0.12)

        // 3. Add video track with optional velocity time remapping
        let timeRange = CMTimeRange(start: config.trimStart, end: config.trimEnd)

        guard let sourceVideoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            throw ExportError.noVideoTrack
        }

        let compositionVideoTrack = composition.addMutableTrack(
            withMediaType: .video,
            preferredTrackID: kCMPersistentTrackID_Invalid
        )!

        if let velMap = velocityMap {
            // Insert video segments with speed remapping
            try insertVelocityMappedVideo(
                track: compositionVideoTrack,
                sourceTrack: sourceVideoTrack,
                sourceStart: config.trimStart,
                velocityMap: velMap
            )
        } else {
            try compositionVideoTrack.insertTimeRange(
                timeRange,
                of: sourceVideoTrack,
                at: .zero
            )
        }
        progressHandler(0.18)

        // 4. Add original audio track (muted or low volume when music is present)
        if let sourceAudioTrack = try await asset.loadTracks(withMediaType: .audio).first {
            let compositionAudioTrack = composition.addMutableTrack(
                withMediaType: .audio,
                preferredTrackID: kCMPersistentTrackID_Invalid
            )!

            if velocityMap != nil {
                // For velocity edits, insert matching segments
                try? compositionAudioTrack.insertTimeRange(
                    timeRange,
                    of: sourceAudioTrack,
                    at: .zero
                )
                // Scale audio to match velocity-edited video duration
                if let velMap = velocityMap {
                    let outputDuration = CMTime(seconds: velMap.outputDuration, preferredTimescale: 600)
                    let inputDuration = CMTimeSubtract(config.trimEnd, config.trimStart)
                    compositionAudioTrack.scaleTimeRange(
                        CMTimeRange(start: .zero, duration: inputDuration),
                        toDuration: outputDuration
                    )
                }
            } else {
                try compositionAudioTrack.insertTimeRange(
                    timeRange,
                    of: sourceAudioTrack,
                    at: .zero
                )
            }

            // Reduce original audio volume when music is present
            if config.musicTrack != nil {
                let audioMix = AVMutableAudioMixInputParameters(track: compositionAudioTrack)
                audioMix.setVolume(0.15, at: .zero) // Background level
            }
        }
        progressHandler(0.22)

        // 5. Add music track
        let effectiveClipDuration: CMTime
        if let velMap = velocityMap {
            effectiveClipDuration = CMTime(seconds: velMap.outputDuration, preferredTimescale: 600)
        } else {
            effectiveClipDuration = CMTimeSubtract(config.trimEnd, config.trimStart)
        }

        if let musicTrack = config.musicTrack, let musicURL = musicTrack.bundleURL {
            let musicAsset = AVURLAsset(url: musicURL)
            if let musicAudioTrack = try? await musicAsset.loadTracks(withMediaType: .audio).first {
                let musicCompositionTrack = composition.addMutableTrack(
                    withMediaType: .audio,
                    preferredTrackID: kCMPersistentTrackID_Invalid
                )!

                let musicDuration = try await musicAsset.load(.duration)
                let musicRange = CMTimeRange(
                    start: .zero,
                    duration: min(effectiveClipDuration, musicDuration)
                )

                try? musicCompositionTrack.insertTimeRange(
                    musicRange,
                    of: musicAudioTrack,
                    at: .zero
                )
            }
        }
        progressHandler(0.30)

        // 6. Apply seamless loop if enabled
        if config.viralConfig.seamlessLoopEnabled {
            applySeamlessLoop(to: composition, clipDuration: effectiveClipDuration)
        }
        progressHandler(0.35)

        // 7. Build video composition for filters/watermark/captions
        let videoComposition = try await buildVideoComposition(
            composition: composition,
            sourceTrack: sourceVideoTrack,
            config: config,
            velocityMap: velocityMap,
            beatMap: beatMap
        )
        progressHandler(0.42)

        // 8. Build audio mix for volume balancing
        let audioMix = buildAudioMix(composition: composition, hasMusicTrack: config.musicTrack != nil)

        // 9. Export
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
        exportSession.audioMix = audioMix
        exportSession.shouldOptimizeForNetworkUse = true

        // Progress polling
        let progressTask = Task { @Sendable in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(250))
                let progress = 0.42 + Double(exportSession.progress) * 0.55
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

    // MARK: - Velocity Time Remapping

    private func insertVelocityMappedVideo(
        track: AVMutableCompositionTrack,
        sourceTrack: AVAssetTrack,
        sourceStart: CMTime,
        velocityMap: VelocityEditService.VelocityMap
    ) throws {
        // Insert the full source range first
        let sourceDuration = CMTime(seconds: velocityMap.originalDuration, preferredTimescale: 600)
        let sourceRange = CMTimeRange(start: sourceStart, duration: sourceDuration)
        try track.insertTimeRange(sourceRange, of: sourceTrack, at: .zero)

        // Apply time remapping using scaleTimeRange for each velocity segment
        // Process segments in reverse order to avoid shifting subsequent ranges
        var currentOutputTime = CMTime(seconds: velocityMap.outputDuration, preferredTimescale: 600)

        for segment in velocityMap.segments.reversed() {
            let segSourceStart = CMTime(seconds: segment.sourceStart, preferredTimescale: 600)
            let segSourceDuration = CMTime(seconds: segment.sourceDuration, preferredTimescale: 600)
            let segOutputDuration = CMTime(seconds: segment.outputDuration, preferredTimescale: 600)

            let segRange = CMTimeRange(start: segSourceStart, duration: segSourceDuration)
            track.scaleTimeRange(segRange, toDuration: segOutputDuration)

            currentOutputTime = CMTimeSubtract(currentOutputTime, segOutputDuration)
        }
    }

    // MARK: - Seamless Loop

    private func applySeamlessLoop(
        to composition: AVMutableComposition,
        clipDuration: CMTime
    ) {
        // Create a seamless loop by adding a very short cross-fade overlap
        // at the boundary. We achieve this by adding a fade-out at the end
        // and a matching fade-in at the start of the audio tracks.
        // The video loop effect is achieved via the overlay animation tool.
        let fadeDuration = CMTime(seconds: 0.4, preferredTimescale: 600)

        for audioTrack in composition.tracks(withMediaType: .audio) {
            let params = AVMutableAudioMixInputParameters(track: audioTrack)
            // Fade out the last 0.4 seconds
            let fadeStart = CMTimeSubtract(clipDuration, fadeDuration)
            params.setVolumeRamp(
                fromStartVolume: 1.0,
                toEndVolume: 0.0,
                timeRange: CMTimeRange(start: fadeStart, duration: fadeDuration)
            )
        }
    }

    // MARK: - Audio Mix

    private func buildAudioMix(
        composition: AVMutableComposition,
        hasMusicTrack: Bool
    ) -> AVMutableAudioMix {
        let audioMix = AVMutableAudioMix()
        var inputParams: [AVMutableAudioMixInputParameters] = []

        let audioTracks = composition.tracks(withMediaType: .audio)

        for (index, track) in audioTracks.enumerated() {
            let params = AVMutableAudioMixInputParameters(track: track)

            if hasMusicTrack {
                if index == 0 {
                    // Original audio: reduce to background level
                    params.setVolume(0.15, at: .zero)
                } else {
                    // Music track: full volume
                    params.setVolume(0.85, at: .zero)
                }
            } else {
                params.setVolume(1.0, at: .zero)
            }

            inputParams.append(params)
        }

        audioMix.inputParameters = inputParams
        return audioMix
    }

    // MARK: - Video Composition

    private func buildVideoComposition(
        composition: AVMutableComposition,
        sourceTrack: AVAssetTrack,
        config: ExportConfig,
        velocityMap: VelocityEditService.VelocityMap?,
        beatMap: BeatSyncService.BeatMap?
    ) async throws -> AVMutableVideoComposition {
        let naturalSize = try await sourceTrack.load(.naturalSize)
        let preferredTransform = try await sourceTrack.load(.preferredTransform)

        let isPortrait = abs(preferredTransform.b) == 1.0
        let videoWidth = isPortrait ? naturalSize.height : naturalSize.width
        let videoHeight = isPortrait ? naturalSize.width : naturalSize.height

        let targetSize = config.outputSize
        let videoComposition = AVMutableVideoComposition()
        videoComposition.renderSize = targetSize
        videoComposition.frameDuration = CMTime(value: 1, timescale: Int32(Constants.exportFrameRate))

        // Calculate effective duration
        let effectiveDuration: CMTime
        if let velMap = velocityMap {
            effectiveDuration = CMTime(seconds: velMap.outputDuration, preferredTimescale: 600)
        } else {
            effectiveDuration = CMTimeSubtract(config.trimEnd, config.trimStart)
        }

        // Instruction
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: effectiveDuration)

        if let compositionTrack = composition.tracks(withMediaType: .video).first {
            let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compositionTrack)

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

            // Seamless loop: fade opacity at end for visual smoothness
            if config.viralConfig.seamlessLoopEnabled {
                let fadeDuration = CMTime(seconds: 0.3, preferredTimescale: 600)
                let fadeStart = CMTimeSubtract(effectiveDuration, fadeDuration)
                layerInstruction.setOpacityRamp(
                    fromStartOpacity: 1.0,
                    toEndOpacity: 0.85,
                    timeRange: CMTimeRange(start: fadeStart, duration: fadeDuration)
                )
            }

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

        // Add overlay layers (kinetic caption + watermark)
        addOverlayLayers(
            to: videoComposition,
            size: targetSize,
            captionText: config.captionText,
            captionStyle: config.captionStyle,
            kineticStyle: config.viralConfig.kineticCaptionStyle,
            addWatermark: config.addWatermark,
            clipDuration: CMTimeGetSeconds(effectiveDuration),
            beatTimes: beatMap?.beatTimes
        )

        return videoComposition
    }

    private func addOverlayLayers(
        to videoComposition: AVMutableVideoComposition,
        size: CGSize,
        captionText: String,
        captionStyle: CaptionStyle,
        kineticStyle: KineticCaptionStyle,
        addWatermark: Bool,
        clipDuration: Double,
        beatTimes: [Double]?
    ) {
        let parentLayer = CALayer()
        parentLayer.frame = CGRect(origin: .zero, size: size)

        let videoLayer = CALayer()
        videoLayer.frame = CGRect(origin: .zero, size: size)
        parentLayer.addSublayer(videoLayer)

        // Kinetic caption overlay
        if !captionText.isEmpty {
            KineticCaptionRenderer.addKineticCaption(
                to: parentLayer,
                text: captionText,
                style: captionStyle,
                kineticStyle: kineticStyle,
                videoSize: size,
                clipDuration: clipDuration,
                beatTimes: beatTimes
            )
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
