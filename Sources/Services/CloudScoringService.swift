import Foundation
import AVFoundation
import UIKit
import os.log

/// Cloud-first highlight scoring via the HighlightMagic backend (P0).
///
/// Routes all Haiku frame-scoring calls through /api/ios-score — the business holds the
/// Anthropic API key server-side; no key is embedded in the iOS binary.
///
/// Pipeline: Extract 1 frame/sec → annotate with audio features →
///           POST to backend /api/ios-score → z-score-normalized ScoredFrames.
actor CloudScoringService {
    static let shared = CloudScoringService()

    private let logger = Logger(subsystem: "com.highlightmagic.app", category: "CloudScoring")

    private init() {}

    // Always available — the backend holds the key; no local Anthropic key required.
    var isAvailable: Bool { true }

    // MARK: - Types

    struct ScoredFrame: Sendable {
        let timestamp: Double
        let score: Double           // 0.0-1.0
        let label: String
        let narrativeRole: String?  // HOOK | HERO | REACTION | RHYTHM | CLOSER
    }

    struct AnnotatedFrame: Sendable {
        let timestamp: Double
        let base64: String
        let audioEnergy: Double?
        let audioOnset: Double?
        let audioBass: Double?
        let audioMid: Double?
        let audioTreble: Double?
    }

    // MARK: - Public API

    /// Score all frames in a video via the backend /api/ios-score endpoint.
    /// Extracts 1 frame/sec with audio annotations, POSTs to backend, returns scored frames.
    func scoreFrames(
        asset: AVURLAsset,
        audioFeatures: [AudioFeatureService.AudioFeatures],
        templateName: String? = nil,
        userId: String,
        progressHandler: @Sendable (Double) -> Void
    ) async throws -> [ScoredFrame] {
        let duration = try await CMTimeGetSeconds(asset.load(.duration))
        guard duration > 0 else { return [] }

        let frameCount = Int(duration)
        guard frameCount > 0 else { return [] }

        progressHandler(0.02)

        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 512, height: 512)

        let audioLookup = Dictionary(audioFeatures.map { (Int($0.timestamp), $0) },
                                     uniquingKeysWith: { first, _ in first })

        var frames: [AnnotatedFrame] = []
        for sec in 0..<frameCount {
            let time = CMTime(seconds: Double(sec), preferredTimescale: 600)
            guard let cgImage = try? await generator.image(at: time).image else { continue }
            let uiImage = UIImage(cgImage: cgImage)
            guard let jpegData = uiImage.jpegData(compressionQuality: 0.6) else { continue }

            let audio = audioLookup[sec]
            frames.append(AnnotatedFrame(
                timestamp: Double(sec),
                base64: jpegData.base64EncodedString(),
                audioEnergy: audio?.audioEnergy,
                audioOnset: audio?.audioOnset,
                audioBass: audio?.audioBass,
                audioMid: audio?.audioMid,
                audioTreble: audio?.audioTreble
            ))

            if sec % 10 == 0 {
                progressHandler(0.02 + Double(sec) / Double(frameCount) * 0.38)
            }
        }

        guard !frames.isEmpty else { return [] }
        progressHandler(0.40)

        let scored = try await postToBackend(frames: frames, userId: userId, templateName: templateName)
        progressHandler(0.75)

        logger.info("Cloud scoring: \(scored.count) frames scored via backend (/api/ios-score)")
        return scored
    }

    // MARK: - Backend Request

    private func postToBackend(
        frames: [AnnotatedFrame],
        userId: String,
        templateName: String?,
        attempt: Int = 0
    ) async throws -> [ScoredFrame] {
        let endpoint = BackendConfig.url(for: "/api/ios-score")

        var framePayload: [[String: Any]] = []
        for frame in frames {
            var f: [String: Any] = [
                "timeSec": frame.timestamp,
                "jpegBase64": frame.base64,
            ]
            if let v = frame.audioEnergy  { f["audioEnergy"]  = v }
            if let v = frame.audioOnset   { f["audioOnset"]   = v }
            if let v = frame.audioBass    { f["audioBass"]    = v }
            if let v = frame.audioMid     { f["audioMid"]     = v }
            if let v = frame.audioTreble  { f["audioTreble"]  = v }
            framePayload.append(f)
        }

        var body: [String: Any] = ["userId": userId, "frames": framePayload]
        if let name = templateName { body["templateName"] = name }
        // Attach the StoreKit signed transaction so the backend can verify Pro server-side (P0/C1).
        let signedTransaction = await MainActor.run { UserAccountService.shared.proSignedTransaction }
        if let jws = signedTransaction { body["signedTransaction"] = jws }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        request.timeoutInterval = 120

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw ClaudeVisionError.requestFailed
            }

            if (httpResponse.statusCode == 429 || httpResponse.statusCode >= 500) && attempt < 3 {
                let retryAfter = httpResponse.value(forHTTPHeaderField: "Retry-After")
                    .flatMap { Double($0) }
                let delay = retryAfter ?? (Double(1 << attempt) * 2)
                logger.info("ios-score HTTP \(httpResponse.statusCode), retry \(attempt + 1)/3 after \(delay, format: .fixed(precision: 1))s")
                try? await Task.sleep(for: .seconds(delay))
                return try await postToBackend(frames: frames, userId: userId,
                                               templateName: templateName, attempt: attempt + 1)
            }

            if httpResponse.statusCode == 402 {
                // Quota exceeded — fall through to on-device fallback (caller handles empty result)
                logger.warning("ios-score: quota exceeded for userId=\(userId, privacy: .private)")
                throw ClaudeVisionError.requestFailed
            }

            guard (200...299).contains(httpResponse.statusCode) else {
                logger.error("ios-score backend HTTP \(httpResponse.statusCode)")
                throw ClaudeVisionError.requestFailed
            }

            return parseBackendResponse(data: data)
        } catch let error as ClaudeVisionError {
            throw error
        } catch {
            if attempt < 3 {
                let delay = Double(1 << attempt) * 2
                logger.info("ios-score network error: \(error.localizedDescription), retry \(attempt + 1)/3 after \(delay, format: .fixed(precision: 1))s")
                try? await Task.sleep(for: .seconds(delay))
                return try await postToBackend(frames: frames, userId: userId,
                                               templateName: templateName, attempt: attempt + 1)
            }
            throw error
        }
    }

    // MARK: - Response Parsing

    private static let validRoles: Set<String> = ["HOOK", "HERO", "REACTION", "RHYTHM", "CLOSER"]

    private func parseBackendResponse(data: Data) -> [ScoredFrame] {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let framesArray = json["frames"] as? [[String: Any]] else {
            logger.warning("ios-score: failed to parse backend response")
            return []
        }

        return framesArray.compactMap { item in
            guard let timeSec = item["timeSec"] as? Double,
                  let score = item["score"] as? Double else { return nil }
            let label = item["label"] as? String ?? "highlight"
            let role = item["role"] as? String
            let validRole = role.flatMap { Self.validRoles.contains($0) ? $0 : nil }
            return ScoredFrame(
                timestamp: timeSec,
                score: max(0, min(1, score)),
                label: label,
                narrativeRole: validRole
            )
        }
    }
}
