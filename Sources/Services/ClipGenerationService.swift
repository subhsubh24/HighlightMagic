import Foundation
import AVFoundation
import CoreImage
import UIKit

actor ClipGenerationService {
    static let shared = ClipGenerationService()

    private init() {}

    /// Generate clips with AI-powered creative direction.
    /// Uses the unified tape planner: Claude sees ALL segments at once and designs
    /// per-clip creative decisions for a cohesive tape (custom velocity curves,
    /// custom color grades, per-clip caption styling, transitions).
    ///
    /// When `precomputedConfigs` is provided (from the Opus cloud planner), those configs
    /// are used directly — skipping the legacy Sonnet re-planning call entirely.
    func generateClips(
        from video: VideoItem,
        segments: [HighlightSegment],
        userPrompt: String = "",
        template: HighlightTemplate? = nil,
        sourceURL: URL? = nil,
        precomputedConfigs: [CustomEffectConfig]? = nil
    ) async -> [EditedClip] {
        // Hook-first ordering: put the highest-confidence segment first
        let ordered = segments.sorted { $0.confidenceScore > $1.confidenceScore }

        // If Opus already planned configs (cloud path), use them directly.
        // Reorder configs to match hook-first segment ordering.
        if let precomputed = precomputedConfigs, precomputed.count == segments.count {
            // Build a lookup from segment ID → config, then reorder to match `ordered`
            let segmentIDs = segments.map(\.id)
            let configByID = Dictionary(uniqueKeysWithValues: zip(segmentIDs, precomputed))
            let reorderedConfigs = ordered.compactMap { configByID[$0.id] }

            if reorderedConfigs.count == ordered.count {
                return zip(ordered, reorderedConfigs).map { segment, aiConfig in
                    buildClipFromAIConfig(
                        aiConfig: aiConfig,
                        sourceVideoID: video.id,
                        segment: segment,
                        template: template
                    )
                }
            }
        }

        if let sourceURL {
            let asset = AVURLAsset(url: sourceURL)

            // Legacy tape planner: Claude Sonnet sees ALL clips at once for cohesive creative direction
            let perClipConfigs = await AIEffectRecommendationService.shared.planTapeEffects(
                for: asset,
                segments: ordered,
                userPrompt: userPrompt,
                template: template
            )

            return zip(ordered, perClipConfigs).map { segment, aiConfig in
                buildClipFromAIConfig(
                    aiConfig: aiConfig,
                    sourceVideoID: video.id,
                    segment: segment,
                    template: template
                )
            }
        }

        // Fallback: no source URL available, use heuristic recommendations
        return ordered.map { segment in
            let aiConfig = AIEffectRecommendationService.shared.fallbackRecommendation(
                template: template,
                prompt: userPrompt
            )
            return buildClipFromAIConfig(
                aiConfig: aiConfig,
                sourceVideoID: video.id,
                segment: segment,
                template: template
            )
        }
    }

    // MARK: - AI Config → EditedClip

    /// Translates an AI effect config into a fully configured EditedClip.
    /// Maps recommended preset names to actual enum values, and carries through
    /// custom parameters for the renderer.
    private nonisolated func buildClipFromAIConfig(
        aiConfig: CustomEffectConfig,
        sourceVideoID: UUID,
        segment: HighlightSegment,
        template: HighlightTemplate?
    ) -> EditedClip {
        let filter = resolveFilter(aiConfig: aiConfig, template: template)
        let grade = resolveGrade(aiConfig: aiConfig, template: template)
        let premiumEffects = resolvePremiumEffects(aiConfig: aiConfig)
        let velocityStyle = resolveVelocityStyle(aiConfig: aiConfig, template: template)
        let kineticStyle = resolveKineticCaption(aiConfig: aiConfig, template: template)
        let captionStyle = resolveCaptionStyle(aiConfig: aiConfig, template: template)
        let musicTrack = resolveMusicTrack(aiConfig: aiConfig, template: template)

        // AI decides beat sync and loop based on content energy, not hardcoded
        let beatSync = aiConfig.beatSyncEnabled ?? (aiConfig.energy != "calm")
        let seamlessLoop = aiConfig.seamlessLoopEnabled ?? (aiConfig.energy != "calm")

        let viralConfig = ViralEditConfig(
            beatSyncEnabled: beatSync,
            velocityStyle: velocityStyle,
            seamlessLoopEnabled: seamlessLoop,
            kineticCaptionStyle: kineticStyle,
            hookFirstOrdering: true
        )

        return EditedClip(
            sourceVideoID: sourceVideoID,
            segment: segment,
            selectedMusicTrack: musicTrack,
            captionText: segment.label,
            captionStyle: captionStyle,
            selectedFilter: filter,
            viralConfig: viralConfig,
            cinematicGrade: grade,
            selectedPremiumEffects: premiumEffects,
            aiEffectConfig: aiConfig
        )
    }

    private nonisolated func resolveFilter(aiConfig: CustomEffectConfig, template: HighlightTemplate?) -> VideoFilter {
        if let name = aiConfig.recommendedFilter,
           let filter = VideoFilter.allCases.first(where: { $0.rawValue == name }) {
            return filter
        }
        // No hardcoded fallback — .none means the AI actively chose no filter
        // (or the fallback heuristic already set recommendedFilter)
        return .none
    }

    private nonisolated func resolveGrade(aiConfig: CustomEffectConfig, template: HighlightTemplate?) -> CinematicGrade {
        if let name = aiConfig.recommendedGrade,
           let grade = CinematicGrade.allCases.first(where: { $0.rawValue == name }) {
            return grade
        }
        // No grade is a valid AI decision (custom grade may be in aiEffectConfig.customGrade)
        return .none
    }

    private nonisolated func resolvePremiumEffects(aiConfig: CustomEffectConfig) -> [PremiumEffect] {
        var effects: [PremiumEffect] = []

        // LUT
        if let name = aiConfig.recommendedLUT,
           let effect = PremiumEffectLibrary.effect(named: name) {
            effects.append(effect)
        }

        // Particle
        if let name = aiConfig.recommendedParticle,
           let effect = PremiumEffectLibrary.effect(named: name) {
            effects.append(effect)
        }

        // Transition
        if let name = aiConfig.recommendedTransition,
           let effect = PremiumEffectLibrary.effect(named: name) {
            effects.append(effect)
        }

        // Overlays
        if let overlayNames = aiConfig.recommendedOverlays {
            for name in overlayNames {
                if let effect = PremiumEffectLibrary.effect(named: name) {
                    effects.append(effect)
                }
            }
        }

        return effects
    }

    private nonisolated func resolveVelocityStyle(
        aiConfig: CustomEffectConfig,
        template: HighlightTemplate?
    ) -> VelocityEditService.VelocityStyle {
        // AI recommendation takes priority
        if let name = aiConfig.recommendedVelocityStyle,
           let style = VelocityEditService.VelocityStyle.allCases.first(where: { $0.rawValue == name }) {
            return style
        }
        // The fallback heuristic already sets recommendedVelocityStyle based on mood/energy,
        // so reaching here means the AI actively returned nil. Use .none to respect that.
        return .none
    }

    private nonisolated func resolveKineticCaption(
        aiConfig: CustomEffectConfig,
        template: HighlightTemplate?
    ) -> KineticCaptionStyle {
        if let name = aiConfig.recommendedKineticCaption,
           let style = KineticCaptionStyle.allCases.first(where: { $0.rawValue == name }) {
            return style
        }
        return .none
    }

    private nonisolated func resolveCaptionStyle(
        aiConfig: CustomEffectConfig,
        template: HighlightTemplate?
    ) -> CaptionStyle {
        if let name = aiConfig.recommendedCaptionStyle,
           let style = CaptionStyle.allCases.first(where: { $0.rawValue == name }) {
            return style
        }
        // Mood-based fallback instead of hardcoded .bold
        switch aiConfig.mood {
        case "calm", "romantic", "warm": return .classic
        case "dramatic", "moody", "dark": return .minimal
        case "cool": return .neon
        default: return .bold
        }
    }

    private nonisolated func resolveMusicTrack(
        aiConfig: CustomEffectConfig,
        template: HighlightTemplate?
    ) -> MusicTrack? {
        // AI-recommended mood → mood-matched track
        if let name = aiConfig.recommendedMusicMood,
           let mood = TrackMood.allCases.first(where: { $0.rawValue == name }),
           let track = MusicLibrary.tracksForMood(mood).first {
            return track
        }
        // Template mood → mood-matched track
        if let template,
           let track = MusicLibrary.tracksForMood(template.suggestedMusicMood).first {
            return track
        }
        // Energy/mood-based fallback instead of hardcoded .upbeat
        let fallbackMood: TrackMood
        switch aiConfig.energy {
        case "calm": fallbackMood = .chill
        case "explosive": fallbackMood = .energetic
        default:
            switch aiConfig.mood {
            case "dramatic", "moody", "dark": fallbackMood = .dramatic
            case "epic": fallbackMood = .epic
            case "playful": fallbackMood = .fun
            default: fallbackMood = .upbeat
            }
        }
        return MusicLibrary.tracksForMood(fallbackMood).first
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
        let aiEffectConfig: CustomEffectConfig?

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
            premiumEffects: [PremiumEffect] = [],
            aiEffectConfig: CustomEffectConfig? = nil
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
            self.aiEffectConfig = aiEffectConfig
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
                || aiEffectConfig?.customGrade != nil
                || aiEffectConfig?.customOverlay != nil
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
                beatMap = BeatSyncService.shared.syntheticBeatMap(
                    bpm: Double(track.bpm),
                    duration: track.durationSeconds
                )
            }
        }
        progressHandler(0.08)

        // 2. Compute velocity map — prefer custom AI keyframes, fall back to preset style
        let clipDuration = CMTimeGetSeconds(config.trimEnd) - CMTimeGetSeconds(config.trimStart)
        var velocityMap: VelocityEditService.VelocityMap?
        if let customKeyframes = config.aiEffectConfig?.customVelocityKeyframes,
           customKeyframes.count >= 2 {
            // AI-designed custom speed curve (matches web platform's per-clip approach)
            velocityMap = await VelocityEditService.shared.generateVelocityMapFromKeyframes(
                clipDuration: clipDuration,
                keyframes: customKeyframes
            )
        } else if config.viralConfig.velocityStyle != .none, let beats = beatMap {
            // Fallback: preset velocity style with AI-driven intensity
            let velocityIntensity = config.aiEffectConfig?.velocityIntensity ?? 1.0
            velocityMap = await VelocityEditService.shared.generateVelocityMap(
                clipDuration: clipDuration,
                beatMap: beats,
                style: config.viralConfig.velocityStyle,
                intensity: velocityIntensity
            )
        }
        progressHandler(0.12)

        // 3. Add video track with optional velocity time remapping
        let timeRange = CMTimeRange(start: config.trimStart, end: config.trimEnd)

        guard let sourceVideoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            throw ExportError.noVideoTrack
        }

        guard let compositionVideoTrack = composition.addMutableTrack(
            withMediaType: .video,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else {
            throw ExportError.exportFailed("Could not create video composition track")
        }

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
        if let sourceAudioTrack = try await asset.loadTracks(withMediaType: .audio).first,
           let compositionAudioTrack = composition.addMutableTrack(
               withMediaType: .audio,
               preferredTrackID: kCMPersistentTrackID_Invalid
           ) {
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
            if let musicAudioTrack = try? await musicAsset.loadTracks(withMediaType: .audio).first,
               let musicCompositionTrack = composition.addMutableTrack(
                   withMediaType: .audio,
                   preferredTrackID: kCMPersistentTrackID_Invalid
               ) {
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
        progressHandler(0.35)

        // 7. Two-pass export pipeline:
        //    Pass 1 (if needed): Apply CIFilter effects via AVAssetReader/Writer
        //    Pass 2: Apply CALayer overlays via AVAssetExportSession with animationTool

        let sourceForOverlays: AVAsset
        if config.needsCIFilterProcessing {
            let intermediateURL = try await renderWithCIFilters(
                composition: composition,
                sourceTrack: sourceVideoTrack,
                config: config,
                velocityMap: velocityMap,
                progressHandler: { p in
                    progressHandler(0.35 + p * 0.25)
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
            effectiveDuration: effectiveClipDuration,
            aiConfig: config.aiEffectConfig
        )
        progressHandler(0.65)

        // 8. Build audio mix (including seamless loop fade if enabled)
        let seamlessLoopFade = config.viralConfig.seamlessLoopEnabled ? effectiveClipDuration : nil
        let audioMix: AVMutableAudioMix
        if config.needsCIFilterProcessing {
            audioMix = await buildAudioMix(asset: sourceForOverlays, hasMusicTrack: config.musicTrack != nil, seamlessLoopFade: seamlessLoopFade, aiConfig: config.aiEffectConfig)
        } else {
            audioMix = await buildAudioMix(asset: composition, hasMusicTrack: config.musicTrack != nil, seamlessLoopFade: seamlessLoopFade, aiConfig: config.aiEffectConfig)
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

                // 4. Apply overlay effects (preset overlays)
                let overlayEffects = config.premiumEffects.filter { $0.category == .overlay }
                if !overlayEffects.isEmpty {
                    image = PremiumEffectRenderer.applyOverlayEffects(
                        to: image,
                        effects: overlayEffects,
                        videoSize: targetSize
                    )
                }

                // 5. Apply AI custom color grade (when no preset fit the scene)
                if let customGrade = config.aiEffectConfig?.customGrade {
                    image = PremiumEffectRenderer.applyCustomGrade(to: image, config: customGrade)
                }

                // 6. Apply AI custom overlay (when no preset fit the scene)
                if let customOverlay = config.aiEffectConfig?.customOverlay {
                    image = PremiumEffectRenderer.applyCustomOverlay(
                        to: image,
                        config: customOverlay,
                        videoSize: targetSize
                    )
                }

                let cropped = image.cropped(to: request.sourceImage.extent)
                request.finish(with: cropped, context: nil)
            }
        )
        filterComposition.renderSize = targetSize
        filterComposition.frameDuration = CMTime(value: 1, timescale: Int32(Constants.exportFrameRate))

        let intermediateURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("intermediate_\(UUID().uuidString)")
            .appendingPathExtension("mp4")

        let audioMix = await buildAudioMix(asset: composition, hasMusicTrack: config.musicTrack != nil)

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

    private func buildOverlayComposition(
        asset: AVAsset,
        sourceTrack: AVAssetTrack,
        config: ExportConfig,
        velocityMap: VelocityEditService.VelocityMap?,
        beatMap: BeatSyncService.BeatMap?,
        effectiveDuration: CMTime,
        aiConfig: CustomEffectConfig? = nil
    ) async throws -> AVMutableVideoComposition {
        let targetSize = config.outputSize
        let videoComposition = AVMutableVideoComposition()
        videoComposition.renderSize = targetSize
        videoComposition.frameDuration = CMTime(value: 1, timescale: Int32(Constants.exportFrameRate))

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

        if config.viralConfig.seamlessLoopEnabled {
            // AI-driven fade duration and end opacity
            let fadeSeconds = aiConfig?.fadeDuration ?? config.aiEffectConfig?.fadeDuration ?? 0.35
            let fadeDuration = CMTime(seconds: fadeSeconds, preferredTimescale: 600)
            let fadeStart = CMTimeSubtract(duration, fadeDuration)
            // Higher energy → sharper cut (lower end opacity), calmer → gentler fade
            let endOpacity: Float = aiConfig?.energy == "explosive" ? 0.7 : (aiConfig?.energy == "calm" ? 0.92 : 0.85)
            layerInstruction.setOpacityRamp(
                fromStartOpacity: 1.0,
                toEndOpacity: endOpacity,
                timeRange: CMTimeRange(start: fadeStart, duration: fadeDuration)
            )
        }

        instruction.layerInstructions = [layerInstruction]
        videoComposition.instructions = [instruction]

        addOverlayLayers(
            to: videoComposition,
            size: targetSize,
            captionText: config.captionText,
            captionStyle: config.captionStyle,
            kineticStyle: config.viralConfig.kineticCaptionStyle,
            addWatermark: config.addWatermark,
            clipDuration: CMTimeGetSeconds(duration),
            beatTimes: beatMap?.beatTimes,
            premiumEffects: config.premiumEffects,
            aiEffectConfig: config.aiEffectConfig
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

    // MARK: - Audio Mix

    /// Builds audio mix with AI-driven volume levels and optional seamless loop fade-out.
    private func buildAudioMix(
        asset: AVAsset,
        hasMusicTrack: Bool,
        seamlessLoopFade: CMTime? = nil,
        aiConfig: CustomEffectConfig? = nil
    ) async -> AVMutableAudioMix {
        let audioMix = AVMutableAudioMix()
        var inputParams: [AVMutableAudioMixInputParameters] = []

        // AI-driven audio mix: original audio volume and music volume
        let originalVolume = Float(aiConfig?.originalAudioVolume ?? 0.15)
        let musicVolume = Float(aiConfig?.musicVolume ?? 0.85)
        // AI-driven fade duration
        let fadeSeconds = aiConfig?.fadeDuration ?? 0.35

        let audioTracks = (try? await asset.loadTracks(withMediaType: .audio)) ?? []

        for (index, track) in audioTracks.enumerated() {
            let params = AVMutableAudioMixInputParameters(track: track)

            let volume: Float
            if hasMusicTrack {
                volume = index == 0 ? originalVolume : musicVolume
            } else {
                volume = 1.0
            }
            params.setVolume(volume, at: .zero)

            // Apply seamless loop audio fade-out at the end of the clip
            if let clipDuration = seamlessLoopFade {
                let fadeDuration = CMTime(seconds: fadeSeconds, preferredTimescale: 600)
                let fadeStart = CMTimeSubtract(clipDuration, fadeDuration)
                params.setVolumeRamp(
                    fromStartVolume: volume,
                    toEndVolume: 0.0,
                    timeRange: CMTimeRange(start: fadeStart, duration: fadeDuration)
                )
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
        premiumEffects: [PremiumEffect] = [],
        aiEffectConfig: CustomEffectConfig? = nil
    ) {
        let parentLayer = CALayer()
        parentLayer.frame = CGRect(origin: .zero, size: size)

        let videoLayer = CALayer()
        videoLayer.frame = CGRect(origin: .zero, size: size)
        parentLayer.addSublayer(videoLayer)

        // Preset transition effects
        let transitionEffects = premiumEffects.filter { $0.category == .transition }
        if !transitionEffects.isEmpty {
            PremiumEffectRenderer.addTransitionEffects(
                to: parentLayer,
                videoLayer: videoLayer,
                effects: transitionEffects,
                videoSize: size,
                clipDuration: clipDuration
            )
        } else if let customTransition = aiEffectConfig?.customTransition {
            // AI-generated custom transition (only if no preset transition was selected)
            PremiumEffectRenderer.addCustomTransition(
                to: parentLayer,
                videoLayer: videoLayer,
                config: customTransition,
                videoSize: size,
                clipDuration: clipDuration
            )
        }

        // Preset particle effects
        let particleEffects = premiumEffects.filter { $0.category == .particle }
        if !particleEffects.isEmpty {
            PremiumEffectRenderer.addParticleEffects(
                to: parentLayer,
                effects: particleEffects,
                videoSize: size,
                clipDuration: clipDuration
            )
        } else if let customParticle = aiEffectConfig?.customParticle {
            // AI-generated custom particle (only if no preset particle was selected)
            PremiumEffectRenderer.addCustomParticle(
                to: parentLayer,
                config: customParticle,
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
