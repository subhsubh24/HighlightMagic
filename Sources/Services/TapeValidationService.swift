import Foundation
import AVFoundation
import UIKit
import os.log

/// Haiku-powered validation pass — mirrors the web platform's /api/validate endpoint.
/// Reviews the assembled tape (clips, captions, transitions, production plan) and returns
/// structured fixes. Fail-open: any error means the tape passes and export proceeds.
/// Supports the full validation loop (max 2 passes) matching web parity.
actor TapeValidationService {
    static let shared = TapeValidationService()

    private let endpoint = "https://api.anthropic.com/v1/messages"
    private let logger = Logger(subsystem: "com.highlightmagic.app", category: "Validation")
    /// Maximum validation passes to keep cost bounded — matches web (2 passes max)
    private let maxValidationPasses = 2

    private init() {}

    /// API key — same chain as ClaudeVisionService.
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

    // MARK: - Validate Tape

    /// Run a Haiku validation pass on the assembled tape.
    /// Extracts a representative frame per clip for visual inspection.
    /// Fail-open: returns passed=true on any error.
    func validateTape(
        clips: [EditedClip],
        plan: AiProductionPlan?,
        contentSummary: String,
        sourceURL: URL?
    ) async -> ValidationResult {
        let passedResult = ValidationResult(passed: true, issues: [], fixes: .empty)

        guard let apiKey else { return passedResult }
        guard !clips.isEmpty else { return passedResult }

        do {
            // Extract one frame per clip for visual inspection
            var clipFrames: [(clipIndex: Int, base64: String)] = []
            if let sourceURL {
                let asset = AVURLAsset(url: sourceURL)
                let generator = AVAssetImageGenerator(asset: asset)
                generator.appliesPreferredTrackTransform = true
                generator.maximumSize = CGSize(width: 384, height: 384)

                for (i, clip) in clips.enumerated() {
                    let midTime = (clip.trimStart.seconds + clip.trimEnd.seconds) / 2
                    let time = CMTime(seconds: midTime, preferredTimescale: 600)
                    guard let cgImage = try? await generator.image(at: time).image else { continue }
                    let uiImage = UIImage(cgImage: cgImage)
                    guard let jpegData = uiImage.jpegData(compressionQuality: 0.5) else { continue }
                    clipFrames.append((i, jpegData.base64EncodedString()))
                }
            }

            return try await callHaikuValidation(
                clips: clips,
                plan: plan,
                contentSummary: contentSummary,
                clipFrames: clipFrames,
                apiKey: apiKey
            )
        } catch {
            logger.warning("Validation failed (fail-open): \(error.localizedDescription)")
            return passedResult
        }
    }

    /// Run the full validation loop (up to maxValidationPasses).
    /// Applies fixes between passes. Matches web validation-fixes.ts logic.
    func runValidationLoop(
        clips: inout [EditedClip],
        plan: inout AiProductionPlan?,
        contentSummary: String,
        sourceURL: URL?,
        onStatusChange: @Sendable (ValidationStatus) -> Void
    ) async -> ValidationResult {
        for pass in 0..<maxValidationPasses {
            onStatusChange(.validating)
            let result = await validateTape(
                clips: clips,
                plan: plan,
                contentSummary: contentSummary,
                sourceURL: sourceURL
            )

            if result.passed {
                onStatusChange(.passed)
                return result
            }

            // Apply fixes
            onStatusChange(.fixing)
            logger.info("Validation pass \(pass + 1): \(result.issues.count) issues, applying fixes")
            applyFixes(result.fixes, to: &clips, plan: &plan)
        }

        // After max passes, pass anyway (fail-open)
        onStatusChange(.passed)
        logger.info("Validation loop exhausted (\(self.maxValidationPasses) passes) — passing anyway")
        return ValidationResult(passed: true, issues: [], fixes: .empty)
    }

    // MARK: - Apply Fixes (parity with web validation-fixes.ts)

    private func applyFixes(_ fixes: ValidationFixes, to clips: inout [EditedClip], plan: inout AiProductionPlan?) {
        // Apply clip updates (caption rewrites, etc.)
        for update in fixes.clipUpdates {
            guard update.clipIndex >= 0, update.clipIndex < clips.count else { continue }
            if let caption = update.captionText {
                clips[update.clipIndex].captionText = caption
            }
        }

        // Remove clips (apply in reverse order to preserve indices)
        let sortedRemovals = fixes.clipRemovals.sorted(by: >)
        for idx in sortedRemovals {
            guard idx >= 0, idx < clips.count else { continue }
            clips.remove(at: idx)
        }

        // Re-number clip order after removals
        for i in clips.indices {
            clips[i].order = i
        }

        // Note: regenerateMusic, regenerateVoiceover, regenerateIntro, regenerateOutro
        // are handled by the caller (they require async generation which this method
        // cannot perform). The fixes are returned so the caller can trigger regeneration.
    }

    // MARK: - Haiku API Call

    private func callHaikuValidation(
        clips: [EditedClip],
        plan: AiProductionPlan?,
        contentSummary: String,
        clipFrames: [(clipIndex: Int, base64: String)],
        apiKey: String
    ) async throws -> ValidationResult {
        let hasFrames = !clipFrames.isEmpty

        let systemPrompt = buildValidationPrompt(hasFrames: hasFrames)

        var userContent: [[String: Any]] = []

        // Tape description
        let description = buildTapeDescription(clips: clips, plan: plan, contentSummary: contentSummary)
        userContent.append(["type": "text", "text": description])

        // Clip frames for visual inspection
        if hasFrames {
            userContent.append(["type": "text", "text": "\n## Visual Frames (one per clip — verify captions, SFX, and visual quality)"])

            for frame in clipFrames {
                let clip = clips[frame.clipIndex]
                let caption = clip.captionText.isEmpty ? "(no caption)" : clip.captionText
                userContent.append(["type": "text", "text": "\nClip \(frame.clipIndex): \"\(caption)\""])
                userContent.append([
                    "type": "image",
                    "source": [
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": frame.base64
                    ] as [String: Any]
                ])
            }
        }

        let requestBody: [String: Any] = [
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 2000,
            "system": systemPrompt,
            "messages": [
                ["role": "user", "content": userContent]
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
        request.timeoutInterval = hasFrames ? 20 : 15

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            logger.warning("Haiku validation returned non-200 — treating as passed")
            return ValidationResult(passed: true, issues: [], fixes: .empty)
        }

        return parseValidationResponse(data: data)
    }

    // MARK: - Prompt

    private func buildValidationPrompt(hasFrames: Bool) -> String {
        let visualChecks = hasFrames ? """

        ## Visual checks (use the frames)
        1. **Hook frame** — The first clip's frame MUST grab attention. If clip 0 is visually weak (static, dark, no clear subject), suggest reordering to put the most visually striking clip first.
        2. **Visual variety** — Do frames look distinct? Flag if consecutive clips look nearly identical.
        3. **Caption-visual mismatch** — Flag only when a caption clearly contradicts what's in the frame.
        4. **Dead clips** — Flag any frame too dark, blurry, or featureless to include.
        """ : ""

        return """
        You are a quality reviewer for short-form highlight reels (TikTok, Reels, Shorts).

        Review the tape and either PASS it or return specific, structured fixes.
        \(visualChecks)
        ## Structural checks
        1. Hook quality — is the first clip a strong opener?
        2. Pacing — energy oscillation, no dead stretches
        3. Caption quality — punchy, varied, no clichés, sounds human not AI
        4. Narrative arc — build-up, climax, resolution
        5. Overall coherence — do captions, transitions, and effects feel like they belong together?

        ## Rules
        - PASS if good enough to post — don't be a perfectionist
        - Only flag problems that would genuinely hurt engagement
        - Every issue MUST include its structured fix
        - Prefer free fixes (caption rewrites, clip reordering) over regeneration
        - Maximum 3 regeneration requests

        ## Output format
        Return a single JSON object:
        {"passed": boolean, "issues": ["description"], "fixes": {"clipUpdates": [{"clipIndex": number, "captionText": "new text"}], "clipRemovals": [number], "regenerateSfx": [{"clipIndex": number, "prompt": "corrected prompt", "durationMs": number}], "regenerateMusic": {"prompt": "new prompt", "durationMs": number}, "regenerateVoiceover": [{"clipIndex": number, "text": "new text"}], "regenerateIntro": {"text": "new text", "stylePrompt": "new style", "duration": number}, "regenerateOutro": {"text": "new text", "stylePrompt": "new style", "duration": number}}}

        Only include fix fields that are needed. If passed is true, fixes should be empty.
        """
    }

    private func buildTapeDescription(clips: [EditedClip], plan: AiProductionPlan?, contentSummary: String) -> String {
        var parts: [String] = []
        parts.append("## Content Summary\n\(contentSummary.isEmpty ? "No summary available" : contentSummary)")

        parts.append("\n## Clips (\(clips.count) total)")
        for (i, c) in clips.enumerated() {
            let dur = String(format: "%.1fs", c.duration)
            let caption = c.captionText.isEmpty ? "(no caption)" : c.captionText
            let filter = c.selectedFilter.rawValue
            let transition = c.transitionType ?? "default"
            parts.append("\(i). \"\(caption)\" [\(dur)] filter=\(filter) transition=\(transition)")
        }

        if let plan {
            parts.append("\n## Production Plan")
            if !plan.musicPrompt.isEmpty { parts.append("Music: \"\(plan.musicPrompt)\"") }
            if let intro = plan.intro { parts.append("Intro: \"\(intro.text)\"") }
            if let outro = plan.outro { parts.append("Outro: \"\(outro.text)\"") }
            if !plan.sfx.isEmpty {
                let sfxDesc = plan.sfx.map { "clip\($0.clipIndex): \"\($0.prompt)\"" }.joined(separator: ", ")
                parts.append("SFX: \(sfxDesc)")
            }
            if let vo = plan.voiceover, vo.enabled {
                let voDesc = vo.segments.map { "clip\($0.clipIndex): \"\($0.text)\"" }.joined(separator: ", ")
                parts.append("Voiceover: \(voDesc)")
            }
            if let philosophy = plan.editingPhilosophy {
                var phParts: [String] = []
                if let vibe = philosophy.vibe { phParts.append("vibe: \(vibe)") }
                if let pace = philosophy.paceProfile { phParts.append("pace: \(pace)") }
                if !phParts.isEmpty { parts.append("Philosophy: \(phParts.joined(separator: ", "))") }
            }
        }

        return parts.joined(separator: "\n")
    }

    // MARK: - Response Parsing

    private func parseValidationResponse(data: Data) -> ValidationResult {
        let passedResult = ValidationResult(passed: true, issues: [], fixes: .empty)

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = json["content"] as? [[String: Any]],
              let textBlock = content.first(where: { $0["type"] as? String == "text" }),
              let text = textBlock["text"] as? String else {
            return passedResult
        }

        guard let jsonString = ClaudeVisionService.extractBalancedJSON(from: text, open: "{", close: "}"),
              let jsonData = jsonString.data(using: .utf8),
              let result = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] else {
            return passedResult
        }

        let passed = result["passed"] as? Bool ?? true
        let issues = result["issues"] as? [String] ?? []

        var fixes = ValidationFixes.empty
        if let fixesDict = result["fixes"] as? [String: Any] {
            // Clip updates
            if let updates = fixesDict["clipUpdates"] as? [[String: Any]] {
                fixes.clipUpdates = updates.compactMap { dict in
                    guard let idx = dict["clipIndex"] as? Int else { return nil }
                    let caption = dict["captionText"] as? String
                    return (clipIndex: idx, captionText: caption)
                }
            }
            // Clip removals
            if let removals = fixesDict["clipRemovals"] as? [Int] {
                fixes.clipRemovals = removals
            }
            // SFX regeneration
            if let sfx = fixesDict["regenerateSfx"] as? [[String: Any]] {
                fixes.regenerateSfx = sfx.compactMap { dict in
                    guard let idx = dict["clipIndex"] as? Int,
                          let prompt = dict["prompt"] as? String else { return nil }
                    let dur = dict["durationMs"] as? Int ?? 1500
                    return (clipIndex: idx, prompt: prompt, durationMs: dur)
                }.prefix(3).map { $0 } // Max 3 regenerations
            }
            // Music regeneration (parity with web)
            if let music = fixesDict["regenerateMusic"] as? [String: Any],
               let prompt = music["prompt"] as? String {
                let durationMs = music["durationMs"] as? Int ?? 30000
                fixes.regenerateMusic = (prompt: prompt, durationMs: durationMs)
            }
            // Voiceover regeneration (parity with web)
            if let vo = fixesDict["regenerateVoiceover"] as? [[String: Any]] {
                fixes.regenerateVoiceover = vo.compactMap { dict in
                    guard let idx = dict["clipIndex"] as? Int,
                          let text = dict["text"] as? String else { return nil }
                    return (clipIndex: idx, text: text)
                }
            }
            // Intro regeneration (parity with web)
            if let intro = fixesDict["regenerateIntro"] as? [String: Any],
               let text = intro["text"] as? String,
               let style = intro["stylePrompt"] as? String {
                let duration = intro["duration"] as? Double ?? 4.0
                fixes.regenerateIntro = (text: text, stylePrompt: style, duration: duration)
            }
            // Outro regeneration (parity with web)
            if let outro = fixesDict["regenerateOutro"] as? [String: Any],
               let text = outro["text"] as? String,
               let style = outro["stylePrompt"] as? String {
                let duration = outro["duration"] as? Double ?? 4.0
                fixes.regenerateOutro = (text: text, stylePrompt: style, duration: duration)
            }
        }

        logger.info("Validation: passed=\(passed), issues=\(issues.count), fixes=\(fixes.clipUpdates.count) updates, \(fixes.clipRemovals.count) removals")
        return ValidationResult(passed: passed, issues: issues, fixes: fixes)
    }
}
