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

    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

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
        let premiumEffects: [PremiumEffect]

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
            cinematicGrade: CinematicGrade = .none,
            premiumEffects: [PremiumEffect] = []
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
            self.premiumEffects = premiumEffects
        }

        static var defaultSize: CGSize {
            CGSize(
                width: Constants.exportWidth,
                height: Constants.exportHeight
            )
        }

        /// Whether any per-frame CIFilter processing is needed.
        var needsCIFilterProcessing: Bool {
            filter != .none
                || cinematicGrade != .none
                || premiumEffects.contains(where: { $0.category == .overlay || $0.category == .lut })
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

        // 4. Add original audio track
        if let sourceAudioTrack = try await asset.loadTracks(withMediaType: .audio).first {
            let compositionAudioTrack = composition.addMutableTrack(
                withMediaType: .audio,
                preferredTrackID: kCMPersistentTrackID_Invalid
            )!

            if velocityMap != nil {
                try? compositionAudioTrack.insertTimeRange(
                    timeRange,
                    of: sourceAudioTrack,
                    at: .zero
                )
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

        // 7. Two-pass export pipeline:
        //    Pass 1 (if needed): Apply CIFilter effects via AVAssetReader/Writer
        //    Pass 2: Apply CALayer overlays via AVAssetExportSession with animationTool

        let sourceForOverlays: AVAsset
        if config.needsCIFilterProcessing {
            // Pass 1: Render composition with CIFilter pipeline to intermediate file
            let intermediateURL = try await renderWithCIFilters(
                composition: composition,
                sourceTrack: sourceVideoTrack,
                config: config,
                velocityMap: velocityMap,
                progressHandler: { p in
                    progressHandler(0.35 + p * 0.25) // 0.35 -> 0.60
                }
            )
            sourceForOverlays = AVURLAsset(url: intermediateURL)
        } else {
            sourceForOverlays = composition
        }
        progressHandler(0.60)

        // Pass 2: Build overlay composition and export
        let videoComposition = try await buildOverlayComposition(
            asset: sourceForOverlays,
            sourceTrack: sourceVideoTrack,
            config: config,
            velocityMap: config.needsCIFilterProcessing ? nil : velocityMap,
            beatMap: beatMap,
            effectiveDuration: effectiveClipDuration
        )
        progressHandler(0.65)

        // 8. Build audio mix
        let audioMix: AVMutableAudioMix
        if config.needsCIFilterProcessing {
            audioMix = buildAudioMix(asset: sourceForOverlays, hasMusicTrack: config.musicTrack != nil)
        } else {
            audioMix = buildAudioMix(asset: composition, hasMusicTrack: config.musicTrack != nil)
        }

        // 9. Final export
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("highlight_\(UUID().uuidString)")
            .appendingPathExtension("mp4")

        guard let exportSession = AVAssetExportSession(
            asset: sourceForOverlays,
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
                let progress = 0.65 + Double(exportSession.progress) * 0.33
                progressHandler(progress)
            }
        }

        await exportSession.export()
        progressTask.cancel()

        // Clean up intermediate file if used
        if config.needsCIFilterProcessing, let intermediateAsset = sourceForOverlays as? AVURLAsset {
            try? FileManager.default.removeItem(at: intermediateAsset.url)
        }

        guard exportSession.status == .completed else {
            throw ExportError.exportFailed(
                exportSession.error?.localizedDescription ?? "Unknown error"
            )
        }

        progressHandler(1.0)
        return outputURL
    }

    // MARK: - Pass 1: CIFilter Rendering

    /// Renders the composition through the CIFilter pipeline (video filter, cinematic grade,
    /// premium LUTs, overlay effects) to an intermediate file using AVAssetReader/Writer.
    private func renderWithCIFilters(
        composition: AVMutableComposition,
        sourceTrack: AVAssetTrack,
        config: ExportConfig,
        velocityMap: VelocityEditService.VelocityMap?,
        progressHandler: @Sendable (Double) -> Void
    ) async throws -> URL {
        let naturalSize = try await sourceTrack.load(.naturalSize)
        let preferredTransform = try await sourceTrack.load(.preferredTransform)
        let targetSize = config.outputSize

        // Build the CIFilter video composition using applyingCIFiltersWithHandler
        let filterComposition = try AVMutableVideoComposition.videoComposition(
            with: composition,
            applyingCIFiltersWithHandler: { [config, targetSize] request in
                var image = request.sourceImage.clampedToExtent()

                // 1. Apply base video filter
                if config.filter != .none, let filterName = config.filter.ciFilterName {
                    if let ciFilter = CIFilter(name: filterName) {
                        ciFilter.setValue(image, forKey: kCIInputImageKey)
                        for (key, value) in config.filter.filterParameters {
                            ciFilter.setValue(value, forKey: key)
                        }
                        image = ciFilter.outputImage ?? image
                    }
                }

                // 2. Apply cinematic grade
                if config.cinematicGrade != .none {
                    image = PremiumEffectRenderer.applyCinematicGrade(to: image, grade: config.cinematicGrade)
                }

                // 3. Apply premium LUT effects
                for effect in config.premiumEffects where effect.category == .lut {
                    image = PremiumEffectRenderer.applyPremiumLUT(to: image, effect: effect)
                }

                // 4. Apply overlay effects (light leak, film grain, vignette, lens flare)
                let overlayEffects = config.premiumEffects.filter { $0.category == .overlay }
                if !overlayEffects.isEmpty {
                    image = PremiumEffectRenderer.applyOverlayEffects(
                        to: image,
                        effects: overlayEffects,
                        videoSize: targetSize
                    )
                }

                // Crop back to render size
                let cropped = image.cropped(to: request.sourceImage.extent)
                request.finish(with: cropped, context: nil)
            }
        )
        filterComposition.renderSize = targetSize
        filterComposition.frameDuration = CMTime(value: 1, timescale: Int32(Constants.exportFrameRate))

        // Export to intermediate file
        let intermediateURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("intermediate_\(UUID().uuidString)")
            .appendingPathExtension("mp4")

        // Build audio mix for intermediate
        let audioMix = buildAudioMix(asset: composition, hasMusicTrack: config.musicTrack != nil)

        guard let exportSession = AVAssetExportSession(
            asset: composition,
            presetName: AVAssetExportPresetHighestQuality
        ) else {
            throw ExportError.exportSessionCreationFailed
        }

        exportSession.outputURL = intermediateURL
        exportSession.outputFileType = .mp4
        exportSession.videoComposition = filterComposition
        exportSession.audioMix = audioMix

        // Progress polling for Pass 1
        let progressTask = Task { @Sendable in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(250))
                progressHandler(Double(exportSession.progress))
            }
        }

        await exportSession.export()
        progressTask.cancel()

        guard exportSession.status == .completed else {
            throw ExportError.exportFailed(
                exportSession.error?.localizedDescription ?? "CIFilter rendering failed"
            )
        }

        return intermediateURL
    }

    // MARK: - Pass 2: Overlay Composition

    /// Builds the video composition for CALayer-based overlays
    /// (particles, transitions, captions, watermark).
    private func buildOverlayComposition(
        asset: AVAsset,
        sourceTrack: AVAssetTrack,
        config: ExportConfig,
        velocityMap: VelocityEditService.VelocityMap?,
        beatMap: BeatSyncService.BeatMap?,
        effectiveDuration: CMTime
    ) async throws -> AVMutableVideoComposition {
        let targetSize = config.outputSize
        let videoComposition = AVMutableVideoComposition()
        videoComposition.renderSize = targetSize
        videoComposition.frameDuration = CMTime(value: 1, timescale: Int32(Constants.exportFrameRate))

        // Get the video track from the asset (could be intermediate or original composition)
        guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            throw ExportError.noVideoTrack
        }

        let naturalSize = try await videoTrack.load(.naturalSize)
        let preferredTransform = try await videoTrack.load(.preferredTransform)

        let isPortrait = abs(preferredTransform.b) == 1.0
        let videoWidth = isPortrait ? naturalSize.height : naturalSize.width
        let videoHeight = isPortrait ? naturalSize.width : naturalSize.height

        let duration: CMTime
        if config.needsCIFilterProcessing {
            // For intermediate files, use their actual duration
            duration = try await asset.load(.duration)
        } else {
            duration = effectiveDuration
        }

        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: duration)

        let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)

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

        // Seamless loop: fade opacity at end
        if config.viralConfig.seamlessLoopEnabled {
            let fadeDuration = CMTime(seconds: 0.3, preferredTimescale: 600)
            let fadeStart = CMTimeSubtract(duration, fadeDuration)
            layerInstruction.setOpacityRamp(
                fromStartOpacity: 1.0,
                toEndOpacity: 0.85,
                timeRange: CMTimeRange(start: fadeStart, duration: fadeDuration)
            )
        }

        instruction.layerInstructions = [layerInstruction]
        videoComposition.instructions = [instruction]

        // Add CALayer overlays
        addOverlayLayers(
            to: videoComposition,
            size: targetSize,
            captionText: config.captionText,
            captionStyle: config.captionStyle,
            kineticStyle: config.viralConfig.kineticCaptionStyle,
            addWatermark: config.addWatermark,
            clipDuration: CMTimeGetSeconds(duration),
            beatTimes: beatMap?.beatTimes,
            premiumEffects: config.premiumEffects
        )

        return videoComposition
    }

    // MARK: - Velocity Time Remapping

    private func insertVelocityMappedVideo(
        track: AVMutableCompositionTrack,
        sourceTrack: AVAssetTrack,
        sourceStart: CMTime,
        velocityMap: VelocityEditService.VelocityMap
    ) throws {
        let sourceDuration = CMTime(seconds: velocityMap.originalDuration, preferredTimescale: 600)
        let sourceRange = CMTimeRange(start: sourceStart, duration: sourceDuration)
        try track.insertTimeRange(sourceRange, of: sourceTrack, at: .zero)

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
        let fadeDuration = CMTime(seconds: 0.4, preferredTimescale: 600)

        for audioTrack in composition.tracks(withMediaType: .audio) {
            let params = AVMutableAudioMixInputParameters(track: audioTrack)
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
        asset: AVAsset,
        hasMusicTrack: Bool
    ) -> AVMutableAudioMix {
        let audioMix = AVMutableAudioMix()
        var inputParams: [AVMutableAudioMixInputParameters] = []

        let audioTracks = asset.tracks(withMediaType: .audio)

        for (index, track) in audioTracks.enumerated() {
            let params = AVMutableAudioMixInputParameters(track: track)

            if hasMusicTrack {
                if index == 0 {
                    params.setVolume(0.15, at: .zero)
                } else {
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

    // MARK: - CALayer Overlays

    private func addOverlayLayers(
        to videoComposition: AVMutableVideoComposition,
        size: CGSize,
        captionText: String,
        captionStyle: CaptionStyle,
        kineticStyle: KineticCaptionStyle,
        addWatermark: Bool,
        clipDuration: Double,
        beatTimes: [Double]?,
        premiumEffects: [PremiumEffect] = []
    ) {
        let parentLayer = CALayer()
        parentLayer.frame = CGRect(origin: .zero, size: size)

        let videoLayer = CALayer()
        videoLayer.frame = CGRect(origin: .zero, size: size)
        parentLayer.addSublayer(videoLayer)

        // Transition effects (intro/outro animations on the video layer)
        let transitionEffects = premiumEffects.filter { $0.category == .transition }
        if !transitionEffects.isEmpty {
            PremiumEffectRenderer.addTransitionEffects(
                to: parentLayer,
                videoLayer: videoLayer,
                effects: transitionEffects,
                videoSize: size,
                clipDuration: clipDuration
            )
        }

        // Particle effects (sparkles, confetti, snow, fireflies)
        let particleEffects = premiumEffects.filter { $0.category == .particle }
        if !particleEffects.isEmpty {
            PremiumEffectRenderer.addParticleEffects(
                to: parentLayer,
                effects: particleEffects,
                videoSize: size,
                clipDuration: clipDuration
            )
        }

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
