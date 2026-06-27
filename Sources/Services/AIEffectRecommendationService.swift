import Foundation
import AVFoundation
import UIKit
import os.log

/// Routes tape planning through the /api/ios-plan backend.
/// The business holds the Anthropic key server-side; no key is embedded or stored in the app.
actor AIEffectRecommendationService {
    static let shared = AIEffectRecommendationService()
    private let logger = Logger(subsystem: "com.highlightmagic.app", category: "AIEffects")
    private init() {}

    /// Result from the tape planner: AI-decided clip boundaries + per-clip creative configs.
    struct TapePlanResult: Sendable {
        let segments: [HighlightSegment]
        let configs: [CustomEffectConfig]
        let productionPlan: AiProductionPlan?
    }

    var isAvailable: Bool { true }

    // MARK: - Public API

    func recommendEffects(
        for asset: AVURLAsset,
        timeRange: CMTimeRange,
        userPrompt: String,
        template: HighlightTemplate? = nil
    ) async -> CustomEffectConfig {
        return fallbackRecommendation(template: template, prompt: userPrompt)
    }

    /// Plan the entire highlight tape via the backend Opus planner.
    func planTapeFromScoredFrames(
        for asset: AVURLAsset,
        totalSeconds: Double,
        scoredFrames: [CloudScoringService.ScoredFrame],
        audioFeatures: [AudioFeatureService.AudioFeatures],
        userPrompt: String,
        creativeDirection: String = "",
        template: HighlightTemplate? = nil,
        transcript: String? = nil,
        progressHandler: (@Sendable (Double) -> Void)? = nil
    ) async -> TapePlanResult {
        let emptyResult = TapePlanResult(segments: [], configs: [], productionPlan: nil)

        do {
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width: 512, height: 512)

            let sortedScores = scoredFrames.sorted { $0.score > $1.score }
            var selectedTimestamps: [Double] = []
            var plannerFrames: [(timestamp: Double, base64: String)] = []
            let maxPlannerFrames = 60
            let minTemporalGap = 3.0
            let maxTotalPayloadBytes = 9 * 1024 * 1024
            let maxPerImageBytes = 5 * 1024 * 1024
            var totalPayloadBytes = 0

            for scored in sortedScores {
                guard plannerFrames.count < maxPlannerFrames else { break }
                guard totalPayloadBytes < maxTotalPayloadBytes else {
                    logger.info("Payload budget reached at \(plannerFrames.count) frames")
                    break
                }
                if selectedTimestamps.contains(where: { abs($0 - scored.timestamp) < minTemporalGap }) { continue }
                let time = CMTime(seconds: scored.timestamp, preferredTimescale: 600)
                guard let cgImage = try? await generator.image(at: time).image else { continue }
                let uiImage = UIImage(cgImage: cgImage)
                guard let jpegData = uiImage.jpegData(compressionQuality: 0.6) else { continue }
                if jpegData.count > maxPerImageBytes { continue }
                let base64 = jpegData.base64EncodedString()
                plannerFrames.append((scored.timestamp, base64))
                selectedTimestamps.append(scored.timestamp)
                totalPayloadBytes += jpegData.count
            }

            plannerFrames.sort { $0.timestamp < $1.timestamp }
            guard !plannerFrames.isEmpty else { return emptyResult }

            progressHandler?(0.80)

            let result = try await callBackendPlan(
                frames: plannerFrames,
                scores: scoredFrames,
                totalSeconds: totalSeconds,
                template: template,
                userPrompt: userPrompt,
                creativeDirection: creativeDirection
            )

            progressHandler?(0.95)
            return result
        } catch {
            logger.warning("Backend tape planner failed: \(error.localizedDescription), returning empty plan")
            return emptyResult
        }
    }

    /// Legacy tape planner for offline use — returns heuristic configs.
    func planTapeEffects(
        for asset: AVURLAsset,
        segments: [HighlightSegment],
        userPrompt: String,
        template: HighlightTemplate? = nil
    ) async -> [CustomEffectConfig] {
        return segments.map { _ in fallbackRecommendation(template: template, prompt: userPrompt) }
    }

    // MARK: - Backend Plan Call

    private func callBackendPlan(
        frames: [(timestamp: Double, base64: String)],
        scores: [CloudScoringService.ScoredFrame],
        totalSeconds: Double,
        template: HighlightTemplate?,
        userPrompt: String,
        creativeDirection: String
    ) async throws -> TapePlanResult {
        let userId = await MainActor.run { UserAccountService.shared.userID }

        let framesJSON: [[String: Any]] = frames.map { ["timeSec": $0.timestamp, "jpegBase64": $0.base64] }

        let scoresJSON: [[String: Any]] = scores.map { frame in
            var dict: [String: Any] = [
                "timeSec": frame.timestamp,
                "score": frame.score,
                "label": frame.label
            ]
            if let role = frame.narrativeRole { dict["role"] = role }
            return dict
        }

        var body: [String: Any] = [
            "userId": userId,
            "frames": framesJSON,
            "scores": scoresJSON,
            "totalSeconds": totalSeconds
        ]
        if let name = template?.name, !name.isEmpty { body["templateName"] = name }
        if !userPrompt.isEmpty { body["userFeedback"] = userPrompt }
        if !creativeDirection.isEmpty { body["creativeDirection"] = creativeDirection }
        // Attach the StoreKit signed transaction so the backend can verify Pro server-side (P0/C1).
        let signedTransaction = await MainActor.run { UserAccountService.shared.proSignedTransaction }
        if let jws = signedTransaction { body["signedTransaction"] = jws }

        let url = BackendConfig.url(for: "/api/ios-plan")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        request.timeoutInterval = 300

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            logger.warning("Backend plan returned non-200 — empty plan")
            return TapePlanResult(segments: [], configs: [], productionPlan: nil)
        }

        guard let wrapper = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return TapePlanResult(segments: [], configs: [], productionPlan: nil)
        }

        return parsePlanResult(from: wrapper, totalSeconds: totalSeconds, template: template, prompt: userPrompt)
    }

    // MARK: - Plan Result Parsing

    private func parsePlanResult(
        from wrapper: [String: Any],
        totalSeconds: Double,
        template: HighlightTemplate?,
        prompt: String
    ) -> TapePlanResult {
        guard let clips = wrapper["clips"] as? [[String: Any]] else {
            logger.warning("Plan result: no clips array")
            return TapePlanResult(segments: [], configs: [], productionPlan: nil)
        }

        var segments: [HighlightSegment] = []
        var configs: [CustomEffectConfig] = []

        for dict in clips {
            let startTime = Self.jsonDouble(dict, "startTime", default: -1)
            let endTime = Self.jsonDouble(dict, "endTime", default: -1)

            guard startTime >= 0, endTime > startTime, endTime <= totalSeconds + 1 else {
                logger.warning("Plan result: skipping clip with invalid boundaries (\(startTime)-\(endTime))")
                continue
            }

            var clampedStart = max(0, startTime)
            var clampedEnd = min(totalSeconds, endTime)
            let duration = clampedEnd - clampedStart

            if duration < Constants.minClipDuration {
                let mid = (clampedStart + clampedEnd) / 2
                let halfMin = Constants.minClipDuration / 2
                clampedStart = max(0, mid - halfMin)
                clampedEnd = min(totalSeconds, clampedStart + Constants.minClipDuration)
            } else if duration > Constants.maxClipDuration {
                clampedEnd = clampedStart + Constants.maxClipDuration
            }

            let confidence = Self.jsonDouble(dict, "confidenceScore", default: 0.8)
            let label = dict["label"] as? String ?? "AI Clip"

            let segment = HighlightSegment(
                startTime: CMTime(seconds: clampedStart, preferredTimescale: 600),
                endTime: CMTime(seconds: clampedEnd, preferredTimescale: 600),
                confidenceScore: max(0, min(1, confidence)),
                label: label,
                detectionSources: [.claudeVision]
            )

            var config = parseManually(jsonData: (try? JSONSerialization.data(withJSONObject: dict)) ?? Data())

            if let kfArray = dict["velocityKeyframes"] as? [[String: Any]] {
                config.customVelocityKeyframes = kfArray.compactMap { kf in
                    guard case let pos = Self.jsonDouble(kf, "position", default: -1),
                          case let spd = Self.jsonDouble(kf, "speed", default: -1),
                          pos >= 0, pos <= 1, spd > 0 else { return nil }
                    return VelocityKeyframe(position: pos, speed: min(spd, 5.0))
                }
                if (config.customVelocityKeyframes?.count ?? 0) < 2 {
                    config.customVelocityKeyframes = nil
                }
            }

            config.customTransitionType = dict["transitionType"] as? String
            if case let td = Self.jsonDouble(dict, "transitionDuration", default: -1), td > 0 {
                config.customTransitionDuration = min(max(td, 0.1), 2.0)
            }
            if case let eps = Self.jsonDouble(dict, "entryPunchScale", default: -1), eps > 0 {
                config.entryPunchScale = min(max(eps, 1.0), 1.1)
            }
            if case let epd = Self.jsonDouble(dict, "entryPunchDuration", default: -1), epd >= 0 {
                config.entryPunchDuration = min(max(epd, 0.0), 0.5)
            }
            config.customCaptionAnimation = dict["captionAnimation"] as? String
            if let fw = dict["captionFontWeight"] as? Int, fw >= 100, fw <= 900 {
                config.customCaptionFontWeight = fw
            }
            config.customCaptionFontStyle = dict["captionFontStyle"] as? String
            config.customCaptionFontFamily = dict["captionFontFamily"] as? String
            config.customCaptionColor = dict["captionColor"] as? String
            config.customCaptionGlowColor = dict["captionGlowColor"] as? String
            if case let gr = Self.jsonDouble(dict, "captionGlowRadius", default: -1), gr >= 0 {
                config.customCaptionGlowRadius = min(gr, 30)
            }

            if let filterCSS = dict["filterCSS"] as? String, !filterCSS.isEmpty {
                config.customGrade = parseCSSFilterToGrade(filterCSS)
            }

            applyMoodBasedDefaults(to: &config)

            segments.append(segment)
            configs.append(config)
        }

        let (validSegments, validConfigs) = deduplicateAndValidateClips(segments: segments, configs: configs)
        let plan = parseProductionPlan(from: wrapper)

        logger.info("Plan result: \(clips.count) clips → \(validSegments.count) after dedup/validation")
        return TapePlanResult(segments: validSegments, configs: validConfigs, productionPlan: plan)
    }

    // MARK: - Clip Deduplication & Spacing

    private nonisolated func deduplicateAndValidateClips(
        segments: [HighlightSegment],
        configs: [CustomEffectConfig]
    ) -> ([HighlightSegment], [CustomEffectConfig]) {
        guard !segments.isEmpty else { return ([], []) }

        let indexed = zip(segments, configs).enumerated()
            .sorted { $0.element.0.startSeconds < $1.element.0.startSeconds }

        var accepted: [(HighlightSegment, CustomEffectConfig)] = []
        let maxClipsPerSource = 8
        let minGapSeconds = 2.0

        for (_, (segment, config)) in indexed {
            guard accepted.count < maxClipsPerSource else { break }

            let candidateDuration = segment.duration
            let overlapsExisting = candidateDuration > 0 && accepted.contains { (existing, _) in
                let overlapStart = max(existing.startSeconds, segment.startSeconds)
                let overlapEnd = min(existing.endSeconds, segment.endSeconds)
                let overlap = max(0, overlapEnd - overlapStart)
                return overlap / candidateDuration > 0.5
            }
            guard !overlapsExisting else { continue }

            let tooClose = accepted.contains { (existing, _) in
                let gapAfter = segment.startSeconds - existing.endSeconds
                let gapBefore = existing.startSeconds - segment.endSeconds
                let gap = max(gapAfter, gapBefore)
                return gap >= 0 && gap < minGapSeconds
            }
            guard !tooClose else { continue }

            accepted.append((segment, config))
        }

        accepted.sort { $0.0.startSeconds < $1.0.startSeconds }
        return (accepted.map(\.0), accepted.map(\.1))
    }

    // MARK: - Production Plan Parsing

    private nonisolated func parseProductionPlan(from wrapper: [String: Any]) -> AiProductionPlan {
        var sfx: [AiProductionPlan.SfxPlan] = []
        if let sfxArray = wrapper["sfx"] as? [[String: Any]] {
            sfx = sfxArray.compactMap { dict in
                guard let clipIndex = dict["clipIndex"] as? Int,
                      let prompt = dict["prompt"] as? String else { return nil }
                let timingStr = dict["timing"] as? String ?? "on"
                let timing = AiProductionPlan.SfxPlan.SfxTiming(rawValue: timingStr) ?? .on
                let durationMs = dict["durationMs"] as? Int ?? 1500
                return AiProductionPlan.SfxPlan(clipIndex: clipIndex, timing: timing, prompt: prompt, durationMs: durationMs)
            }
        }

        var voiceover: AiProductionPlan.VoiceoverPlan?
        if let voDict = wrapper["voiceover"] as? [String: Any] {
            let enabled = voDict["enabled"] as? Bool ?? false
            let voiceCharacter = voDict["voiceCharacter"] as? String ?? "male-narrator-warm"
            let delaySec = Self.jsonDouble(voDict, "delaySec", default: 0.3)
            var segments: [AiProductionPlan.VoiceoverPlan.Segment] = []
            if let segArray = voDict["segments"] as? [[String: Any]] {
                segments = segArray.compactMap { s in
                    guard let idx = s["clipIndex"] as? Int, let text = s["text"] as? String else { return nil }
                    return AiProductionPlan.VoiceoverPlan.Segment(clipIndex: idx, text: text)
                }
            }
            voiceover = AiProductionPlan.VoiceoverPlan(enabled: enabled, segments: segments, voiceCharacter: voiceCharacter, delaySec: delaySec)
        }

        var intro: AiProductionPlan.CardPlan?
        if let introDict = wrapper["intro"] as? [String: Any] {
            intro = AiProductionPlan.CardPlan(
                text: introDict["text"] as? String ?? "",
                stylePrompt: introDict["stylePrompt"] as? String ?? "",
                duration: Self.jsonDouble(introDict, "duration", default: 4)
            )
        }
        var outro: AiProductionPlan.CardPlan?
        if let outroDict = wrapper["outro"] as? [String: Any] {
            outro = AiProductionPlan.CardPlan(
                text: outroDict["text"] as? String ?? "",
                stylePrompt: outroDict["stylePrompt"] as? String ?? "",
                duration: Self.jsonDouble(outroDict, "duration", default: 4)
            )
        }

        var filmStock: AiProductionPlan.FilmStockPlan?
        if let fsDict = wrapper["filmStock"] as? [String: Any] {
            filmStock = AiProductionPlan.FilmStockPlan(
                grain: Self.jsonDouble(fsDict, "grain", default: 0),
                warmth: Self.jsonDouble(fsDict, "warmth", default: 0),
                contrast: Self.jsonDouble(fsDict, "contrast", default: 1.0),
                fadedBlacks: Self.jsonDouble(fsDict, "fadedBlacks", default: 0)
            )
        }

        var thumbnail: AiProductionPlan.ThumbnailPlan?
        if let thDict = wrapper["thumbnail"] as? [String: Any] {
            thumbnail = AiProductionPlan.ThumbnailPlan(
                sourceClipIndex: thDict["sourceClipIndex"] as? Int ?? 0,
                frameTime: Self.jsonDouble(thDict, "frameTime", default: 0),
                stylePrompt: thDict["stylePrompt"] as? String ?? ""
            )
        }

        return AiProductionPlan(
            intro: intro,
            outro: outro,
            sfx: sfx,
            voiceover: voiceover,
            musicPrompt: wrapper["musicPrompt"] as? String ?? "",
            musicDurationMs: wrapper["musicDurationMs"] as? Int ?? 0,
            musicVolume: Self.jsonDouble(wrapper, "musicVolume", default: 0.8),
            sfxVolume: Self.jsonDouble(wrapper, "sfxVolume", default: 0.7),
            voiceoverVolume: Self.jsonDouble(wrapper, "voiceoverVolume", default: 0.85),
            defaultTransitionDuration: Self.jsonDouble(wrapper, "defaultTransitionDuration", default: 0.3),
            photoDisplayDuration: Self.jsonDouble(wrapper, "photoDisplayDuration", default: 3),
            loopCrossfadeDuration: Self.jsonDouble(wrapper, "loopCrossfadeDuration", default: 0.5),
            captionEntranceDuration: Self.jsonDouble(wrapper, "captionEntranceDuration", default: 0.3),
            captionExitDuration: Self.jsonDouble(wrapper, "captionExitDuration", default: 0.2),
            captionAppearDelay: Self.jsonDouble(wrapper, "captionAppearDelay", default: 0.12),
            beatPulseIntensity: Self.optionalDouble(wrapper, "beatPulseIntensity"),
            beatFlashOpacity: Self.optionalDouble(wrapper, "beatFlashOpacity"),
            beatFlashThreshold: Self.optionalDouble(wrapper, "beatFlashThreshold"),
            beatFlashColor: wrapper["beatFlashColor"] as? String,
            grainOpacity: Self.optionalDouble(wrapper, "grainOpacity"),
            vignetteIntensity: Self.optionalDouble(wrapper, "vignetteIntensity"),
            vignetteTightness: Self.optionalDouble(wrapper, "vignetteTightness"),
            captionFontSize: Self.optionalDouble(wrapper, "captionFontSize"),
            captionVerticalPosition: Self.optionalDouble(wrapper, "captionVerticalPosition"),
            watermarkOpacity: Self.optionalDouble(wrapper, "watermarkOpacity"),
            filmStock: filmStock,
            letterboxColor: wrapper["letterboxColor"] as? String,
            thumbnail: thumbnail
        )
    }

    private static func optionalDouble(_ dict: [String: Any], _ key: String) -> Double? {
        guard dict[key] != nil else { return nil }
        if let d = dict[key] as? Double { return d }
        if let i = dict[key] as? Int { return Double(i) }
        return nil
    }

    private nonisolated func parseCSSFilterToGrade(_ css: String) -> CustomColorGrade {
        var grade = CustomColorGrade()
        let pattern = #"(\w[\w-]*)\(([^)]+)\)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return grade }
        let matches = regex.matches(in: css, range: NSRange(css.startIndex..., in: css))

        for match in matches {
            guard let funcRange = Range(match.range(at: 1), in: css),
                  let valRange = Range(match.range(at: 2), in: css) else { continue }
            let funcName = String(css[funcRange])
            let valStr = String(css[valRange]).replacingOccurrences(of: "deg", with: "")
            guard let value = Double(valStr) else { continue }

            switch funcName {
            case "saturate": grade.saturation = value
            case "contrast": grade.contrast = value
            case "brightness": grade.brightness = value - 1.0
            case "sepia":
                grade.temperature = 6500 + value * 2000
                grade.saturation = max(grade.saturation - value * 0.3, 0.3)
            case "hue-rotate": grade.hueShift = value / 360.0
            default: break
            }
        }

        return grade
    }

    // MARK: - Manual Config Parsing (fallback for strict Codable failures)

    private func parseManually(jsonData: Data) -> CustomEffectConfig {
        guard let dict = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] else {
            return CustomEffectConfig()
        }

        var config = CustomEffectConfig()
        config.sceneDescription = dict["sceneDescription"] as? String
        config.mood = dict["mood"] as? String
        config.dominantColors = dict["dominantColors"] as? [String]
        config.lighting = dict["lighting"] as? String
        config.energy = dict["energy"] as? String
        config.recommendedFilter = dict["recommendedFilter"] as? String
        config.recommendedGrade = dict["recommendedGrade"] as? String
        config.recommendedLUT = dict["recommendedLUT"] as? String
        config.recommendedOverlays = dict["recommendedOverlays"] as? [String]
        config.recommendedParticle = dict["recommendedParticle"] as? String
        config.recommendedTransition = dict["recommendedTransition"] as? String
        config.recommendedVelocityStyle = dict["recommendedVelocityStyle"] as? String
        config.recommendedKineticCaption = dict["recommendedKineticCaption"] as? String
        config.recommendedCaptionStyle = dict["recommendedCaptionStyle"] as? String
        config.recommendedMusicMood = dict["recommendedMusicMood"] as? String
        config.beatSyncEnabled = dict["beatSyncEnabled"] as? Bool
        config.seamlessLoopEnabled = dict["seamlessLoopEnabled"] as? Bool
        if case let mv = Self.jsonDouble(dict, "musicVolume", default: -1), mv >= 0 {
            config.musicVolume = min(max(mv, 0), 1)
        }
        if case let ov = Self.jsonDouble(dict, "originalAudioVolume", default: -1), ov >= 0 {
            config.originalAudioVolume = min(max(ov, 0), 1)
        }
        if case let fd = Self.jsonDouble(dict, "fadeDuration", default: -1), fd >= 0 {
            config.fadeDuration = min(max(fd, 0.1), 1.0)
        }
        if case let vi = Self.jsonDouble(dict, "velocityIntensity", default: -1), vi >= 0 {
            config.velocityIntensity = min(max(vi, 0), 1)
        }

        if let gradeDict = dict["customGrade"] as? [String: Any] {
            var grade = CustomColorGrade()
            grade.temperature = Self.jsonDouble(gradeDict, "temperature", default: 6500)
            grade.tint = Self.jsonDouble(gradeDict, "tint", default: 0)
            grade.saturation = Self.jsonDouble(gradeDict, "saturation", default: 1.0)
            grade.contrast = Self.jsonDouble(gradeDict, "contrast", default: 1.0)
            grade.brightness = Self.jsonDouble(gradeDict, "brightness", default: 0)
            grade.vibrance = Self.jsonDouble(gradeDict, "vibrance", default: 0)
            grade.exposure = Self.jsonDouble(gradeDict, "exposure", default: 0)
            grade.hueShift = Self.jsonDouble(gradeDict, "hueShift", default: 0)
            grade.fadeAmount = Self.jsonDouble(gradeDict, "fadeAmount", default: 0)
            grade.sharpen = Self.jsonDouble(gradeDict, "sharpen", default: 0)
            config.customGrade = grade
        }

        if let particleDict = dict["customParticle"] as? [String: Any] {
            var particle = CustomParticle()
            if let shape = particleDict["shape"] as? String {
                particle.shape = CustomParticle.ParticleShape(rawValue: shape) ?? .circle
            }
            particle.colors = particleDict["colors"] as? [String] ?? ["FFFFFF"]
            particle.birthRate = Self.jsonDouble(particleDict, "birthRate", default: 5.0)
            particle.velocity = Self.jsonDouble(particleDict, "velocity", default: 30.0)
            particle.scale = Self.jsonDouble(particleDict, "scale", default: 0.04)
            particle.lifetime = Self.jsonDouble(particleDict, "lifetime", default: 3.0)
            if let dir = particleDict["direction"] as? String {
                particle.direction = CustomParticle.ParticleDirection(rawValue: dir) ?? .random
            }
            if let pos = particleDict["emitterPosition"] as? String {
                particle.emitterPosition = CustomParticle.EmitterPosition(rawValue: pos) ?? .fullScreen
            }
            config.customParticle = particle
        }

        if let overlayDict = dict["customOverlay"] as? [String: Any] {
            var overlay = CustomOverlay()
            if let type = overlayDict["type"] as? String {
                overlay.type = CustomOverlay.OverlayType(rawValue: type) ?? .colorWash
            }
            overlay.color = overlayDict["color"] as? String ?? "FF8C42"
            overlay.opacity = Self.jsonDouble(overlayDict, "opacity", default: 0.15)
            if let blend = overlayDict["blendMode"] as? String {
                overlay.blendMode = CustomOverlay.BlendMode(rawValue: blend) ?? .screen
            }
            overlay.intensity = Self.jsonDouble(overlayDict, "intensity", default: 1.0)
            config.customOverlay = overlay
        }

        if let transDict = dict["customTransition"] as? [String: Any] {
            var trans = CustomTransition()
            if let type = transDict["type"] as? String {
                trans.type = CustomTransition.TransitionType(rawValue: type) ?? .fade
            }
            trans.duration = Self.jsonDouble(transDict, "duration", default: 0.35)
            trans.intensity = Self.jsonDouble(transDict, "intensity", default: 1.0)
            if let dir = transDict["direction"] as? String {
                trans.direction = CustomTransition.TransitionDirection(rawValue: dir) ?? .left
            }
            config.customTransition = trans
        }

        return config
    }

    private static func jsonDouble(_ dict: [String: Any], _ key: String, default defaultValue: Double) -> Double {
        if let d = dict[key] as? Double { return d }
        if let i = dict[key] as? Int { return Double(i) }
        return defaultValue
    }

    // MARK: - Fallback Heuristics

    nonisolated func fallbackRecommendation(
        template: HighlightTemplate? = nil,
        prompt: String = ""
    ) -> CustomEffectConfig {
        var config = CustomEffectConfig()
        let lowered = prompt.lowercased()

        if let template {
            config.sceneDescription = template.description
            config.recommendedFilter = template.suggestedFilter.rawValue
            config.recommendedVelocityStyle = template.suggestedVelocityStyle.rawValue
            config.recommendedKineticCaption = template.suggestedKineticCaption.rawValue
            config.recommendedCaptionStyle = template.suggestedCaptionStyle.rawValue
            config.recommendedMusicMood = template.suggestedMusicMood.rawValue
        }

        if lowered.containsAny(["sunset", "sunrise", "golden", "beach", "warm"]) {
            config.mood = "warm"
            config.lighting = "golden_hour"
            config.energy = "calm"
            config.recommendedLUT = config.recommendedLUT ?? "Golden Hour"
            config.recommendedTransition = config.recommendedTransition ?? "Cross Dissolve"
            config.recommendedOverlays = config.recommendedOverlays ?? ["Light Leak"]
            config.recommendedVelocityStyle = config.recommendedVelocityStyle ?? "Smooth"
            config.recommendedKineticCaption = config.recommendedKineticCaption ?? "Slide"
            config.recommendedCaptionStyle = config.recommendedCaptionStyle ?? "Minimal"
            config.recommendedMusicMood = config.recommendedMusicMood ?? "Chill"
        } else if lowered.containsAny(["night", "neon", "city", "club"]) {
            config.mood = "energetic"
            config.lighting = "night"
            config.energy = "high"
            config.recommendedLUT = config.recommendedLUT ?? "Cyberpunk"
            config.recommendedTransition = config.recommendedTransition ?? "Glitch"
            config.recommendedParticle = config.recommendedParticle ?? "Sparkles"
            config.recommendedVelocityStyle = config.recommendedVelocityStyle ?? "Bullet"
            config.recommendedKineticCaption = config.recommendedKineticCaption ?? "Pop"
            config.recommendedCaptionStyle = config.recommendedCaptionStyle ?? "Neon"
            config.recommendedMusicMood = config.recommendedMusicMood ?? "Energetic"
        } else if lowered.containsAny(["winter", "snow", "cold", "ski", "ice"]) {
            config.mood = "cool"
            config.lighting = "overcast"
            config.energy = "moderate"
            config.recommendedFilter = config.recommendedFilter ?? "Cool"
            config.recommendedParticle = config.recommendedParticle ?? "Snow"
            config.recommendedTransition = config.recommendedTransition ?? "Cross Dissolve"
            config.recommendedOverlays = config.recommendedOverlays ?? ["Film Grain"]
            config.recommendedVelocityStyle = config.recommendedVelocityStyle ?? "Smooth"
            config.recommendedKineticCaption = config.recommendedKineticCaption ?? "Slide"
            config.recommendedCaptionStyle = config.recommendedCaptionStyle ?? "Minimal"
            config.recommendedMusicMood = config.recommendedMusicMood ?? "Chill"
        } else if lowered.containsAny(["wedding", "love", "romantic", "anniversary", "valentine"]) {
            config.mood = "romantic"
            config.lighting = "soft"
            config.energy = "calm"
            config.recommendedLUT = config.recommendedLUT ?? "Golden Hour"
            config.recommendedParticle = config.recommendedParticle ?? "Hearts"
            config.recommendedTransition = config.recommendedTransition ?? "Cross Dissolve"
            config.recommendedOverlays = config.recommendedOverlays ?? ["Bokeh", "Light Leak"]
            config.recommendedVelocityStyle = config.recommendedVelocityStyle ?? "Smooth"
            config.recommendedKineticCaption = config.recommendedKineticCaption ?? "Typewriter"
            config.recommendedCaptionStyle = config.recommendedCaptionStyle ?? "Classic"
            config.recommendedMusicMood = config.recommendedMusicMood ?? "Chill"
        } else if lowered.containsAny(["birthday", "celebration", "grad"]) {
            config.mood = "playful"
            config.energy = "high"
            config.recommendedParticle = config.recommendedParticle ?? "Confetti"
            config.recommendedTransition = config.recommendedTransition ?? "Zoom Burst"
            config.recommendedVelocityStyle = config.recommendedVelocityStyle ?? "Hero"
            config.recommendedKineticCaption = config.recommendedKineticCaption ?? "Pop"
            config.recommendedCaptionStyle = config.recommendedCaptionStyle ?? "Bold"
            config.recommendedMusicMood = config.recommendedMusicMood ?? "Fun"
        } else if lowered.containsAny(["adventure", "mountain", "hike", "summit", "epic"]) {
            config.mood = "epic"
            config.lighting = "golden_hour"
            config.energy = "high"
            config.recommendedGrade = config.recommendedGrade ?? "Warm Glow"
            config.recommendedTransition = config.recommendedTransition ?? "Zoom Burst"
            config.recommendedOverlays = config.recommendedOverlays ?? ["Lens Flare"]
            config.recommendedVelocityStyle = config.recommendedVelocityStyle ?? "Hero"
            config.recommendedKineticCaption = config.recommendedKineticCaption ?? "Pop"
            config.recommendedCaptionStyle = config.recommendedCaptionStyle ?? "Bold"
            config.recommendedMusicMood = config.recommendedMusicMood ?? "Epic"
        } else if lowered.containsAny(["workout", "gym", "fitness", "run", "sport"]) {
            config.mood = "energetic"
            config.energy = "explosive"
            config.recommendedLUT = config.recommendedLUT ?? "Bleach Bypass"
            config.recommendedTransition = config.recommendedTransition ?? "Flash"
            config.recommendedVelocityStyle = config.recommendedVelocityStyle ?? "Bullet"
            config.recommendedKineticCaption = config.recommendedKineticCaption ?? "Bounce"
            config.recommendedCaptionStyle = config.recommendedCaptionStyle ?? "Bold"
            config.recommendedMusicMood = config.recommendedMusicMood ?? "Energetic"
        } else if lowered.containsAny(["food", "cooking", "recipe", "eat", "restaurant"]) {
            config.mood = "warm"
            config.lighting = "indoor"
            config.energy = "calm"
            config.recommendedLUT = config.recommendedLUT ?? "Golden Hour"
            config.recommendedTransition = config.recommendedTransition ?? "Cross Dissolve"
            config.recommendedOverlays = config.recommendedOverlays ?? ["Vignette Pro"]
            config.recommendedVelocityStyle = config.recommendedVelocityStyle ?? "Smooth"
            config.recommendedKineticCaption = config.recommendedKineticCaption ?? "Slide"
            config.recommendedCaptionStyle = config.recommendedCaptionStyle ?? "Classic"
            config.recommendedMusicMood = config.recommendedMusicMood ?? "Chill"
        } else if lowered.containsAny(["pet", "dog", "cat", "puppy", "kitten"]) {
            config.mood = "playful"
            config.energy = "moderate"
            config.recommendedFilter = config.recommendedFilter ?? "Vibrant"
            config.recommendedParticle = config.recommendedParticle ?? "Sparkles"
            config.recommendedTransition = config.recommendedTransition ?? "Bounce In"
            config.recommendedVelocityStyle = config.recommendedVelocityStyle ?? "Montage"
            config.recommendedKineticCaption = config.recommendedKineticCaption ?? "Bounce"
            config.recommendedCaptionStyle = config.recommendedCaptionStyle ?? "Neon"
            config.recommendedMusicMood = config.recommendedMusicMood ?? "Fun"
        } else if lowered.containsAny(["cinematic", "film", "movie", "dramatic"]) {
            config.mood = "dramatic"
            config.energy = "moderate"
            config.recommendedLUT = config.recommendedLUT ?? "Matte Film"
            config.recommendedTransition = config.recommendedTransition ?? "Cross Dissolve"
            config.recommendedOverlays = config.recommendedOverlays ?? ["Anamorphic Flare", "Film Grain"]
            config.recommendedVelocityStyle = config.recommendedVelocityStyle ?? "Hero"
            config.recommendedKineticCaption = config.recommendedKineticCaption ?? "Typewriter"
            config.recommendedCaptionStyle = config.recommendedCaptionStyle ?? "Classic"
            config.recommendedMusicMood = config.recommendedMusicMood ?? "Dramatic"
        } else if lowered.containsAny(["vintage", "retro", "old", "throwback", "nostalg"]) {
            config.mood = "warm"
            config.energy = "calm"
            config.recommendedLUT = config.recommendedLUT ?? "Vintage 8mm"
            config.recommendedTransition = config.recommendedTransition ?? "Cross Dissolve"
            config.recommendedOverlays = config.recommendedOverlays ?? ["Film Grain", "Vignette Pro", "Dust"]
            config.recommendedVelocityStyle = config.recommendedVelocityStyle ?? "Smooth"
            config.recommendedKineticCaption = config.recommendedKineticCaption ?? "Typewriter"
            config.recommendedCaptionStyle = config.recommendedCaptionStyle ?? "Classic"
            config.recommendedMusicMood = config.recommendedMusicMood ?? "Chill"
        } else if lowered.containsAny(["campfire", "cozy", "cabin", "evening"]) {
            config.mood = "warm"
            config.lighting = "night"
            config.energy = "calm"
            config.recommendedLUT = config.recommendedLUT ?? "Golden Hour"
            config.recommendedParticle = config.recommendedParticle ?? "Embers"
            config.recommendedTransition = config.recommendedTransition ?? "Cross Dissolve"
            config.recommendedOverlays = config.recommendedOverlays ?? ["Vignette Pro"]
            config.recommendedVelocityStyle = config.recommendedVelocityStyle ?? "Smooth"
            config.recommendedKineticCaption = config.recommendedKineticCaption ?? "Slide"
            config.recommendedCaptionStyle = config.recommendedCaptionStyle ?? "Classic"
            config.recommendedMusicMood = config.recommendedMusicMood ?? "Chill"
        } else if lowered.containsAny(["rain", "storm", "moody", "dark"]) {
            config.mood = "moody"
            config.lighting = "overcast"
            config.energy = "moderate"
            config.recommendedGrade = config.recommendedGrade ?? "Moody"
            config.recommendedParticle = config.recommendedParticle ?? "Rain"
            config.recommendedTransition = config.recommendedTransition ?? "Glitch"
            config.recommendedOverlays = config.recommendedOverlays ?? ["Vignette Pro"]
            config.recommendedVelocityStyle = config.recommendedVelocityStyle ?? "Hero"
            config.recommendedKineticCaption = config.recommendedKineticCaption ?? "Slide"
            config.recommendedCaptionStyle = config.recommendedCaptionStyle ?? "Minimal"
            config.recommendedMusicMood = config.recommendedMusicMood ?? "Dramatic"
        } else if lowered.containsAny(["party"]) {
            config.mood = "energetic"
            config.energy = "high"
            config.recommendedFilter = config.recommendedFilter ?? "Vibrant"
            config.recommendedParticle = config.recommendedParticle ?? "Confetti"
            config.recommendedTransition = config.recommendedTransition ?? "Zoom Burst"
            config.recommendedVelocityStyle = config.recommendedVelocityStyle ?? "Hero"
            config.recommendedKineticCaption = config.recommendedKineticCaption ?? "Pop"
            config.recommendedCaptionStyle = config.recommendedCaptionStyle ?? "Bold"
            config.recommendedMusicMood = config.recommendedMusicMood ?? "Fun"
        } else {
            config.mood = config.mood ?? "energetic"
            config.energy = config.energy ?? "moderate"
        }

        applyMoodBasedDefaults(to: &config)
        return config
    }

    private nonisolated func applyMoodBasedDefaults(to config: inout CustomEffectConfig) {
        let mood = config.mood ?? "energetic"
        let energy = config.energy ?? "moderate"

        if config.beatSyncEnabled == nil {
            config.beatSyncEnabled = energy != "calm"
        }

        if config.seamlessLoopEnabled == nil {
            config.seamlessLoopEnabled = energy != "calm"
        }

        if config.musicVolume == nil {
            switch energy {
            case "calm": config.musicVolume = jitter(0.55, range: 0.1)
            case "moderate": config.musicVolume = jitter(0.72, range: 0.08)
            case "high": config.musicVolume = jitter(0.83, range: 0.06)
            case "explosive": config.musicVolume = jitter(0.88, range: 0.05)
            default: config.musicVolume = jitter(0.78, range: 0.08)
            }
        }

        if config.originalAudioVolume == nil {
            switch energy {
            case "calm": config.originalAudioVolume = jitter(0.45, range: 0.1)
            case "moderate": config.originalAudioVolume = jitter(0.22, range: 0.08)
            case "high": config.originalAudioVolume = jitter(0.13, range: 0.06)
            case "explosive": config.originalAudioVolume = jitter(0.08, range: 0.04)
            default: config.originalAudioVolume = jitter(0.18, range: 0.06)
            }
        }

        if config.fadeDuration == nil {
            switch energy {
            case "calm": config.fadeDuration = jitter(0.55, range: 0.1)
            case "moderate": config.fadeDuration = jitter(0.38, range: 0.06)
            case "high": config.fadeDuration = jitter(0.28, range: 0.05)
            case "explosive": config.fadeDuration = jitter(0.18, range: 0.04)
            default: config.fadeDuration = jitter(0.33, range: 0.06)
            }
        }

        if config.velocityIntensity == nil {
            switch energy {
            case "calm": config.velocityIntensity = jitter(0.28, range: 0.08)
            case "moderate": config.velocityIntensity = jitter(0.57, range: 0.1)
            case "high": config.velocityIntensity = jitter(0.78, range: 0.08)
            case "explosive": config.velocityIntensity = jitter(0.93, range: 0.07)
            default: config.velocityIntensity = jitter(0.65, range: 0.1)
            }
        }

        if config.recommendedVelocityStyle == nil {
            switch energy {
            case "calm": config.recommendedVelocityStyle = "Smooth"
            case "moderate": config.recommendedVelocityStyle = "Montage"
            case "high": config.recommendedVelocityStyle = "Hero"
            case "explosive": config.recommendedVelocityStyle = "Bullet"
            default: config.recommendedVelocityStyle = "Hero"
            }
        }

        if config.recommendedKineticCaption == nil {
            switch energy {
            case "calm": config.recommendedKineticCaption = "Slide"
            case "moderate": config.recommendedKineticCaption = "Typewriter"
            case "high": config.recommendedKineticCaption = "Pop"
            case "explosive": config.recommendedKineticCaption = "Bounce"
            default: config.recommendedKineticCaption = "Pop"
            }
        }

        if config.recommendedCaptionStyle == nil {
            switch mood {
            case "calm", "romantic", "warm": config.recommendedCaptionStyle = "Classic"
            case "energetic", "playful", "epic": config.recommendedCaptionStyle = "Bold"
            case "dramatic", "moody", "dark": config.recommendedCaptionStyle = "Minimal"
            case "cool": config.recommendedCaptionStyle = "Neon"
            default: config.recommendedCaptionStyle = "Bold"
            }
        }

        if config.recommendedTransition == nil {
            switch energy {
            case "calm": config.recommendedTransition = "Cross Dissolve"
            case "moderate": config.recommendedTransition = "Cross Dissolve"
            case "high": config.recommendedTransition = "Zoom Burst"
            case "explosive": config.recommendedTransition = "Flash"
            default: config.recommendedTransition = "Zoom Burst"
            }
        }

        if config.recommendedMusicMood == nil {
            switch mood {
            case "calm", "romantic", "warm": config.recommendedMusicMood = "Chill"
            case "energetic", "explosive": config.recommendedMusicMood = "Energetic"
            case "epic": config.recommendedMusicMood = "Epic"
            case "playful": config.recommendedMusicMood = "Fun"
            case "dramatic", "moody", "dark": config.recommendedMusicMood = "Dramatic"
            default: config.recommendedMusicMood = "Upbeat"
            }
        }
    }

    private nonisolated func jitter(_ base: Double, range: Double) -> Double {
        let offset = Double.random(in: -range...range)
        return min(1.0, max(0.0, base + offset))
    }
}

// MARK: - String Helpers

private extension String {
    func containsAny(_ keywords: [String]) -> Bool {
        keywords.contains { self.contains($0) }
    }
}
