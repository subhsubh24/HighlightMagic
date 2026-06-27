import Foundation
import AVFoundation
import UIKit
import os.log

/// Haiku-powered validation pass routed through /api/ios-validate (business-paid model).
/// Reviews the assembled tape and returns structured fixes. Fail-open: any network or
/// parse error means the tape passes and export proceeds.
actor TapeValidationService {
    static let shared = TapeValidationService()

    private let logger = Logger(subsystem: "com.highlightmagic.app", category: "Validation")
    private let maxValidationPasses = 2

    private init() {}

    // Backend validation is always enabled — isAvailable remains true so ProcessingView
    // proceeds without needing a local API key.
    var isAvailable: Bool { true }

    // MARK: - Validate Tape

    /// Run a Haiku validation pass on the assembled tape via /api/ios-validate.
    /// Extracts one frame per clip for visual inspection. Fail-open on any error.
    func validateTape(
        clips: [EditedClip],
        plan: AiProductionPlan?,
        contentSummary: String,
        sourceURL: URL?
    ) async -> ValidationResult {
        let passedResult = ValidationResult(passed: true, issues: [], fixes: .empty)
        guard !clips.isEmpty else { return passedResult }

        do {
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

            return try await callBackendValidation(
                clips: clips,
                plan: plan,
                contentSummary: contentSummary,
                clipFrames: clipFrames
            )
        } catch {
            logger.warning("Validation failed (fail-open): \(error.localizedDescription)")
            return passedResult
        }
    }

    /// Run the full validation loop (up to maxValidationPasses).
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

            onStatusChange(.fixing)
            logger.info("Validation pass \(pass + 1): \(result.issues.count) issues, applying fixes")
            applyFixes(result.fixes, to: &clips, plan: &plan)
        }

        onStatusChange(.passed)
        logger.info("Validation loop exhausted (\(self.maxValidationPasses) passes) — passing anyway")
        return ValidationResult(passed: true, issues: [], fixes: .empty)
    }

    // MARK: - Apply Fixes

    private func applyFixes(_ fixes: ValidationFixes, to clips: inout [EditedClip], plan: inout AiProductionPlan?) {
        for update in fixes.clipUpdates {
            guard update.clipIndex >= 0, update.clipIndex < clips.count else { continue }
            if let caption = update.captionText {
                clips[update.clipIndex].captionText = caption
            }
        }

        let sortedRemovals = fixes.clipRemovals.sorted(by: >)
        for idx in sortedRemovals {
            guard idx >= 0, idx < clips.count else { continue }
            clips.remove(at: idx)
        }

        for i in clips.indices {
            clips[i].order = i
        }
    }

    // MARK: - Backend Call

    private func callBackendValidation(
        clips: [EditedClip],
        plan: AiProductionPlan?,
        contentSummary: String,
        clipFrames: [(clipIndex: Int, base64: String)]
    ) async throws -> ValidationResult {
        let passedResult = ValidationResult(passed: true, issues: [], fixes: .empty)

        let userId = await MainActor.run { UserAccountService.shared.userID }

        // Serialize clips
        let clipsJSON: [[String: Any]] = clips.map { c in
            [
                "captionText": c.captionText,
                "durationSec": c.duration,
                "filter": c.selectedFilter.rawValue,
                "transition": c.transitionType ?? "default",
                "order": c.order
            ]
        }

        // Serialize plan
        var body: [String: Any] = [
            "userId": userId,
            "clips": clipsJSON,
            "contentSummary": contentSummary
        ]

        if let plan {
            if !plan.musicPrompt.isEmpty { body["musicPrompt"] = plan.musicPrompt }
            if !plan.sfx.isEmpty {
                body["sfx"] = plan.sfx.map { ["clipIndex": $0.clipIndex, "prompt": $0.prompt] }
            }
            if let vo = plan.voiceover {
                body["voiceover"] = [
                    "enabled": vo.enabled,
                    "segments": vo.segments.map { ["clipIndex": $0.clipIndex, "text": $0.text] }
                ]
            }
            if let intro = plan.intro {
                body["intro"] = ["text": intro.text, "stylePrompt": intro.stylePrompt]
            }
            if let outro = plan.outro {
                body["outro"] = ["text": outro.text, "stylePrompt": outro.stylePrompt]
            }
        }

        if !clipFrames.isEmpty {
            body["clipFrames"] = clipFrames.map { ["clipIndex": $0.clipIndex, "jpegBase64": $0.base64] }
        }

        guard let url = URL(string: BackendConfig.url(for: "/api/ios-validate")) else {
            return passedResult
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        request.timeoutInterval = clipFrames.isEmpty ? 15 : 22

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            logger.warning("ios-validate returned non-2xx — treating as passed")
            return passedResult
        }

        return parseBackendResponse(data: data)
    }

    // MARK: - Response Parsing

    private func parseBackendResponse(data: Data) -> ValidationResult {
        let passedResult = ValidationResult(passed: true, issues: [], fixes: .empty)

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return passedResult
        }

        let passed = json["passed"] as? Bool ?? true
        let issues = json["issues"] as? [String] ?? []

        var fixes = ValidationFixes.empty
        if let fixesDict = json["fixes"] as? [String: Any] {
            if let updates = fixesDict["clipUpdates"] as? [[String: Any]] {
                fixes.clipUpdates = updates.compactMap { dict in
                    guard let idx = dict["clipIndex"] as? Int else { return nil }
                    return (clipIndex: idx, captionText: dict["captionText"] as? String)
                }
            }
            if let removals = fixesDict["clipRemovals"] as? [Int] {
                fixes.clipRemovals = removals
            }
            if let sfx = fixesDict["regenerateSfx"] as? [[String: Any]] {
                fixes.regenerateSfx = sfx.compactMap { dict in
                    guard let idx = dict["clipIndex"] as? Int,
                          let prompt = dict["prompt"] as? String else { return nil }
                    let dur = dict["durationMs"] as? Int ?? 1500
                    return (clipIndex: idx, prompt: prompt, durationMs: dur)
                }.prefix(3).map { $0 }
            }
            if let music = fixesDict["regenerateMusic"] as? [String: Any],
               let prompt = music["prompt"] as? String {
                fixes.regenerateMusic = (prompt: prompt, durationMs: music["durationMs"] as? Int ?? 30000)
            }
            if let vo = fixesDict["regenerateVoiceover"] as? [[String: Any]] {
                fixes.regenerateVoiceover = vo.compactMap { dict in
                    guard let idx = dict["clipIndex"] as? Int,
                          let text = dict["text"] as? String else { return nil }
                    return (clipIndex: idx, text: text)
                }
            }
            if let intro = fixesDict["regenerateIntro"] as? [String: Any],
               let text = intro["text"] as? String,
               let style = intro["stylePrompt"] as? String {
                fixes.regenerateIntro = (text: text, stylePrompt: style, duration: intro["duration"] as? Double ?? 4.0)
            }
            if let outro = fixesDict["regenerateOutro"] as? [String: Any],
               let text = outro["text"] as? String,
               let style = outro["stylePrompt"] as? String {
                fixes.regenerateOutro = (text: text, stylePrompt: style, duration: outro["duration"] as? Double ?? 4.0)
            }
        }

        logger.info("ios-validate: passed=\(passed), issues=\(issues.count), updates=\(fixes.clipUpdates.count), removals=\(fixes.clipRemovals.count)")
        return ValidationResult(passed: passed, issues: issues, fixes: fixes)
    }
}
