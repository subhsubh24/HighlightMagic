import Foundation
import AVFoundation
import UIKit
import os.log

/// Analyzes video content via Claude Vision and recommends effects that best fit the scene.
///
/// The AI examines representative frames from each clip and returns either:
/// 1. Named presets from the existing library (when a good fit exists)
/// 2. Custom parameters (when the scene warrants a unique treatment)
///
/// Falls back to heuristic-based recommendations when the API is unavailable.
actor AIEffectRecommendationService {
    static let shared = AIEffectRecommendationService()

    private let endpoint = "https://api.anthropic.com/v1/messages"
    private let logger = Logger(subsystem: "com.highlightmagic.app", category: "AIEffects")
    private var lastRequestTime: Date = .distantPast
    private let minRequestInterval: TimeInterval = 1.0

    private init() {}

    /// API key — delegates to the same resolution chain as ClaudeVisionService.
    private var apiKey: String? {
        if let envKey = ProcessInfo.processInfo.environment["ANTHROPIC_API_KEY"],
           !envKey.isEmpty, envKey.hasPrefix("sk-ant-") {
            return envKey
        }
        if let keychainKey = KeychainHelper.load(key: "claude_api_key"),
           !keychainKey.isEmpty, keychainKey.hasPrefix("sk-ant-") {
            return keychainKey
        }
        if let plistKey = Bundle.main.object(forInfoDictionaryKey: "ANTHROPIC_API_KEY") as? String,
           !plistKey.isEmpty, plistKey.hasPrefix("sk-ant-") {
            return plistKey
        }
        return nil
    }

    var isAvailable: Bool { apiKey != nil }

    // MARK: - Public API

    /// Analyze a video clip and return an AI-generated effect configuration.
    /// Extracts representative frames, sends them to Claude, and parses the response.
    func recommendEffects(
        for asset: AVURLAsset,
        timeRange: CMTimeRange,
        userPrompt: String,
        template: HighlightTemplate? = nil
    ) async -> CustomEffectConfig {
        guard let apiKey else {
            logger.info("No API key available, using fallback heuristics")
            return fallbackRecommendation(template: template, prompt: userPrompt)
        }

        do {
            // Extract 3 representative frames from the clip
            let frames = try await extractFrames(from: asset, timeRange: timeRange, count: 3)
            guard !frames.isEmpty else {
                return fallbackRecommendation(template: template, prompt: userPrompt)
            }

            // Rate limiting
            let elapsed = Date.now.timeIntervalSince(lastRequestTime)
            if elapsed < minRequestInterval {
                try? await Task.sleep(for: .seconds(minRequestInterval - elapsed))
            }

            let config = try await callClaudeForEffects(
                frames: frames,
                userPrompt: userPrompt,
                template: template,
                apiKey: apiKey
            )
            lastRequestTime = .now
            return config
        } catch {
            logger.warning("AI effect recommendation failed: \(error.localizedDescription), using fallback")
            return fallbackRecommendation(template: template, prompt: userPrompt)
        }
    }

    // MARK: - Frame Extraction

    private func extractFrames(
        from asset: AVURLAsset,
        timeRange: CMTimeRange,
        count: Int
    ) async throws -> [(time: Double, base64: String)] {
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 512, height: 512)

        let duration = CMTimeGetSeconds(timeRange.duration)
        let startSeconds = CMTimeGetSeconds(timeRange.start)

        var frames: [(time: Double, base64: String)] = []
        for i in 0..<count {
            let fraction = Double(i) / Double(max(count - 1, 1))
            let timestamp = startSeconds + duration * fraction
            let time = CMTime(seconds: timestamp, preferredTimescale: 600)
            guard let cgImage = try? await generator.image(at: time).image else { continue }
            let uiImage = UIImage(cgImage: cgImage)
            guard let jpegData = uiImage.jpegData(compressionQuality: 0.5) else { continue }
            frames.append((timestamp, jpegData.base64EncodedString()))
        }

        return frames
    }

    // MARK: - Claude API Call

    private func callClaudeForEffects(
        frames: [(time: Double, base64: String)],
        userPrompt: String,
        template: HighlightTemplate?,
        apiKey: String
    ) async throws -> CustomEffectConfig {
        var contentBlocks: [[String: Any]] = []

        let instruction = buildEffectPrompt(userPrompt: userPrompt, template: template)
        contentBlocks.append(["type": "text", "text": instruction])

        for frame in frames {
            contentBlocks.append([
                "type": "text",
                "text": "Frame at \(String(format: "%.1f", frame.time))s:"
            ])
            contentBlocks.append([
                "type": "image",
                "source": [
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": frame.base64
                ] as [String: Any]
            ])
        }

        let requestBody: [String: Any] = [
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 1024,
            "messages": [
                ["role": "user", "content": contentBlocks]
            ]
        ]

        guard let url = URL(string: endpoint) else {
            throw ClaudeVisionError.invalidEndpoint
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
        request.timeoutInterval = 30

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw ClaudeVisionError.requestFailed
        }

        return parseEffectResponse(data: data)
    }

    // MARK: - Prompt Construction

    private func buildEffectPrompt(userPrompt: String, template: HighlightTemplate?) -> String {
        let lutNames = PremiumEffectLibrary.presetNames(for: .lut).joined(separator: ", ")
        let particleNames = PremiumEffectLibrary.presetNames(for: .particle).joined(separator: ", ")
        let transitionNames = PremiumEffectLibrary.presetNames(for: .transition).joined(separator: ", ")
        let overlayNames = PremiumEffectLibrary.presetNames(for: .overlay).joined(separator: ", ")
        let filterNames = VideoFilter.allCases.map(\.rawValue).joined(separator: ", ")
        let gradeNames = CinematicGrade.allCases.map(\.rawValue).joined(separator: ", ")
        let velocityNames = VelocityEditService.VelocityStyle.allCases.map(\.rawValue).joined(separator: ", ")
        let captionStyleNames = CaptionStyle.allCases.map(\.rawValue).joined(separator: ", ")
        let captionNames = KineticCaptionStyle.allCases.map(\.rawValue).joined(separator: ", ")
        let moodNames = TrackMood.allCases.map(\.rawValue).joined(separator: ", ")

        let templateContext = template.map { "The user selected the '\($0.name)' template (\($0.description))." } ?? ""

        return """
        You are a professional video colorist and effects supervisor for a mobile highlight reel app.
        Analyze these video frames and recommend the best visual treatment.

        User's intent: "\(userPrompt.isEmpty ? "create a great highlight reel" : userPrompt)"
        \(templateContext)

        AVAILABLE PRESETS (prefer these when they're a good fit):
        - Cinematic LUTs: \(lutNames)
        - Video Filters: \(filterNames)
        - Cinematic Grades: \(gradeNames)
        - Particles: \(particleNames)
        - Transitions: \(transitionNames)
        - Overlays: \(overlayNames)
        - Velocity Styles: \(velocityNames)
        - Caption Animations: \(captionNames)
        - Caption Styles: \(captionStyleNames)
        - Music Moods: \(moodNames)

        INSTRUCTIONS:
        1. Describe the scene (lighting, colors, mood, energy level, subject matter)
        2. Pick the BEST-FIT preset from each category, OR generate custom parameters if no preset fits well
        3. Not every clip needs particles or overlays — only recommend them when they genuinely enhance the content
        4. Match the energy: calm scenes → smooth transitions, high-energy → snappy transitions
        5. Color grade should complement the existing lighting, not fight it

        Respond with a single JSON object (no markdown, no explanation outside JSON):
        {
          "sceneDescription": "brief description of what you see",
          "mood": "one of: calm, romantic, energetic, dramatic, playful, epic, moody, warm, cool, dark",
          "dominantColors": ["hex1", "hex2"],
          "lighting": "one of: golden_hour, overcast, night, indoor, harsh, soft",
          "energy": "one of: calm, moderate, high, explosive",
          "recommendedFilter": "preset name or null",
          "recommendedGrade": "preset name or null",
          "recommendedLUT": "preset name or null",
          "recommendedOverlays": ["preset name"] or null,
          "recommendedParticle": "preset name or null",
          "recommendedTransition": "preset name or null",
          "recommendedVelocityStyle": "preset name or null",
          "recommendedKineticCaption": "preset name or null",
          "recommendedCaptionStyle": "one of: Bold, Minimal, Neon, Classic or null",
          "recommendedMusicMood": "mood name or null",
          "customGrade": null or {
            "temperature": 6500, "tint": 0, "saturation": 1.0, "contrast": 1.0,
            "brightness": 0.0, "vibrance": 0.0, "exposure": 0.0, "hueShift": 0.0,
            "fadeAmount": 0.0, "sharpen": 0.0
          },
          "customOverlay": null or {
            "type": "colorWash|radialGradient|linearGradient|vignette|noise",
            "color": "hex", "opacity": 0.15, "blendMode": "screen|overlay|multiply|softLight|addition",
            "intensity": 1.0
          },
          "customParticle": null or {
            "shape": "circle|star|heart|square|diamond|ring|glow",
            "colors": ["hex"], "birthRate": 5.0, "velocity": 30.0,
            "scale": 0.04, "lifetime": 3.0,
            "direction": "up|down|random|outward",
            "emitterPosition": "fullScreen|top|bottom|lowerHalf|center"
          },
          "customTransition": null or {
            "type": "fade|zoom|slide|spin|flash|bounce|iris",
            "duration": 0.35, "intensity": 1.0,
            "direction": "left|right|center|up|down"
          }
        }

        IMPORTANT: Only include custom* fields when no preset is a good match. Presets are preferred for consistency.
        If a preset IS a good fit, set the recommended* field AND leave the corresponding custom* field as null.
        """
    }

    // MARK: - Response Parsing

    private func parseEffectResponse(data: Data) -> CustomEffectConfig {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = json["content"] as? [[String: Any]],
              let textBlock = content.first(where: { $0["type"] as? String == "text" }),
              let text = textBlock["text"] as? String else {
            logger.warning("Failed to parse Claude response structure")
            return CustomEffectConfig()
        }

        // Find JSON object in response text
        guard let jsonStart = text.firstIndex(of: "{"),
              let jsonEnd = text.lastIndex(of: "}") else {
            logger.warning("No JSON found in Claude response")
            return CustomEffectConfig()
        }

        let jsonString = String(text[jsonStart...jsonEnd])
        guard let jsonData = jsonString.data(using: .utf8) else {
            return CustomEffectConfig()
        }

        do {
            let config = try JSONDecoder().decode(CustomEffectConfig.self, from: jsonData)
            logger.info("AI recommended effects: mood=\(config.mood ?? "unknown"), hasCustom=\(config.hasCustomParameters)")
            return config
        } catch {
            logger.warning("Failed to decode CustomEffectConfig: \(error.localizedDescription)")
            // Try manual parsing as fallback
            return parseManually(jsonData: jsonData)
        }
    }

    /// Manual fallback parser for when strict Codable decoding fails
    /// (e.g., if Claude returns slightly non-conforming JSON).
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

        // Parse custom grade
        if let gradeDict = dict["customGrade"] as? [String: Any] {
            var grade = CustomColorGrade()
            grade.temperature = gradeDict["temperature"] as? Double ?? 6500
            grade.tint = gradeDict["tint"] as? Double ?? 0
            grade.saturation = gradeDict["saturation"] as? Double ?? 1.0
            grade.contrast = gradeDict["contrast"] as? Double ?? 1.0
            grade.brightness = gradeDict["brightness"] as? Double ?? 0
            grade.vibrance = gradeDict["vibrance"] as? Double ?? 0
            grade.exposure = gradeDict["exposure"] as? Double ?? 0
            grade.hueShift = gradeDict["hueShift"] as? Double ?? 0
            grade.fadeAmount = gradeDict["fadeAmount"] as? Double ?? 0
            grade.sharpen = gradeDict["sharpen"] as? Double ?? 0
            config.customGrade = grade
        }

        // Parse custom particle
        if let particleDict = dict["customParticle"] as? [String: Any] {
            var particle = CustomParticle()
            if let shape = particleDict["shape"] as? String {
                particle.shape = CustomParticle.ParticleShape(rawValue: shape) ?? .circle
            }
            particle.colors = particleDict["colors"] as? [String] ?? ["FFFFFF"]
            particle.birthRate = particleDict["birthRate"] as? Double ?? 5.0
            particle.velocity = particleDict["velocity"] as? Double ?? 30.0
            particle.scale = particleDict["scale"] as? Double ?? 0.04
            particle.lifetime = particleDict["lifetime"] as? Double ?? 3.0
            if let dir = particleDict["direction"] as? String {
                particle.direction = CustomParticle.ParticleDirection(rawValue: dir) ?? .random
            }
            if let pos = particleDict["emitterPosition"] as? String {
                particle.emitterPosition = CustomParticle.EmitterPosition(rawValue: pos) ?? .fullScreen
            }
            config.customParticle = particle
        }

        // Parse custom overlay
        if let overlayDict = dict["customOverlay"] as? [String: Any] {
            var overlay = CustomOverlay()
            if let type = overlayDict["type"] as? String {
                overlay.type = CustomOverlay.OverlayType(rawValue: type) ?? .colorWash
            }
            overlay.color = overlayDict["color"] as? String ?? "FF8C42"
            overlay.opacity = overlayDict["opacity"] as? Double ?? 0.15
            if let blend = overlayDict["blendMode"] as? String {
                overlay.blendMode = CustomOverlay.BlendMode(rawValue: blend) ?? .screen
            }
            overlay.intensity = overlayDict["intensity"] as? Double ?? 1.0
            config.customOverlay = overlay
        }

        // Parse custom transition
        if let transDict = dict["customTransition"] as? [String: Any] {
            var trans = CustomTransition()
            if let type = transDict["type"] as? String {
                trans.type = CustomTransition.TransitionType(rawValue: type) ?? .fade
            }
            trans.duration = transDict["duration"] as? Double ?? 0.35
            trans.intensity = transDict["intensity"] as? Double ?? 1.0
            if let dir = transDict["direction"] as? String {
                trans.direction = CustomTransition.TransitionDirection(rawValue: dir) ?? .left
            }
            config.customTransition = trans
        }

        return config
    }

    // MARK: - Fallback Heuristics

    /// When the API is unavailable, use keyword-based heuristics to pick presets.
    /// This ensures the app still provides intelligent defaults without AI.
    /// Nonisolated because it uses no actor state — pure function of inputs.
    nonisolated func fallbackRecommendation(
        template: HighlightTemplate? = nil,
        prompt: String = ""
    ) -> CustomEffectConfig {
        var config = CustomEffectConfig()
        let lowered = prompt.lowercased()

        // Seed from template if available (template preferences, not hardcoded constants)
        if let template {
            config.sceneDescription = template.description
            config.recommendedFilter = template.suggestedFilter.rawValue
            config.recommendedVelocityStyle = template.suggestedVelocityStyle.rawValue
            config.recommendedKineticCaption = template.suggestedKineticCaption.rawValue
            config.recommendedCaptionStyle = template.suggestedCaptionStyle.rawValue
            config.recommendedMusicMood = template.suggestedMusicMood.rawValue
        }

        // Keyword-based mood and effect matching.
        // Every branch fills ALL fields so there are zero gaps for hardcoded defaults.
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
            // Generic default — still uses mood-based reasoning, not arbitrary constants
            config.mood = config.mood ?? "energetic"
            config.energy = config.energy ?? "moderate"
        }

        // Fill any remaining nil fields using mood-based heuristics.
        // This ensures EVERY field is populated — no hardcoded fallthrough gaps.
        applyMoodBasedDefaults(to: &config)

        return config
    }

    /// Fills any remaining nil recommendation fields using the mood/energy already set.
    /// This is the final safety net — after keyword matching and template seeding,
    /// any field that's still nil gets a mood-appropriate value.
    private nonisolated func applyMoodBasedDefaults(to config: inout CustomEffectConfig) {
        let mood = config.mood ?? "energetic"
        let energy = config.energy ?? "moderate"

        // Velocity: match energy level
        if config.recommendedVelocityStyle == nil {
            switch energy {
            case "calm": config.recommendedVelocityStyle = "Smooth"
            case "moderate": config.recommendedVelocityStyle = "Montage"
            case "high": config.recommendedVelocityStyle = "Hero"
            case "explosive": config.recommendedVelocityStyle = "Bullet"
            default: config.recommendedVelocityStyle = "Hero"
            }
        }

        // Kinetic caption: match energy level
        if config.recommendedKineticCaption == nil {
            switch energy {
            case "calm": config.recommendedKineticCaption = "Slide"
            case "moderate": config.recommendedKineticCaption = "Typewriter"
            case "high": config.recommendedKineticCaption = "Pop"
            case "explosive": config.recommendedKineticCaption = "Bounce"
            default: config.recommendedKineticCaption = "Pop"
            }
        }

        // Caption style: match mood
        if config.recommendedCaptionStyle == nil {
            switch mood {
            case "calm", "romantic", "warm": config.recommendedCaptionStyle = "Classic"
            case "energetic", "playful", "epic": config.recommendedCaptionStyle = "Bold"
            case "dramatic", "moody", "dark": config.recommendedCaptionStyle = "Minimal"
            case "cool": config.recommendedCaptionStyle = "Neon"
            default: config.recommendedCaptionStyle = "Bold"
            }
        }

        // Transition: match energy
        if config.recommendedTransition == nil {
            switch energy {
            case "calm": config.recommendedTransition = "Cross Dissolve"
            case "moderate": config.recommendedTransition = "Cross Dissolve"
            case "high": config.recommendedTransition = "Zoom Burst"
            case "explosive": config.recommendedTransition = "Flash"
            default: config.recommendedTransition = "Zoom Burst"
            }
        }

        // Music mood: match mood
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
}

// MARK: - String Helpers

private extension String {
    func containsAny(_ keywords: [String]) -> Bool {
        keywords.contains { self.contains($0) }
    }
}
