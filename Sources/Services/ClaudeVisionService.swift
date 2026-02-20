import Foundation
import AVFoundation
import UIKit

actor ClaudeVisionService {
    static let shared = ClaudeVisionService()

    private let maxFramesPerRequest = 4
    private let endpoint = "https://api.anthropic.com/v1/messages"

    private var apiKey: String? {
        // Load from environment or keychain
        ProcessInfo.processInfo.environment["ANTHROPIC_API_KEY"]
            ?? KeychainHelper.load(key: "claude_api_key")
    }

    private init() {}

    var isAvailable: Bool {
        apiKey != nil
    }

    // MARK: - Score Highlight Candidates

    struct ScoredTimestamp: Sendable {
        let seconds: Double
        let score: Double
        let reason: String
    }

    func scoreHighlights(
        asset: AVURLAsset,
        prompt: String,
        candidateTimestamps: [Double],
        progressHandler: @Sendable (Double) -> Void
    ) async throws -> [ScoredTimestamp] {
        guard let apiKey else {
            throw ClaudeVisionError.noAPIKey
        }

        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 512, height: 512)

        var allScored: [ScoredTimestamp] = []

        // Process in batches
        let batches = stride(from: 0, to: candidateTimestamps.count, by: maxFramesPerRequest)

        for batchStart in batches {
            let batchEnd = min(batchStart + maxFramesPerRequest, candidateTimestamps.count)
            let batchTimestamps = Array(candidateTimestamps[batchStart..<batchEnd])

            // Extract frames
            var frames: [(time: Double, base64: String)] = []
            for timestamp in batchTimestamps {
                let time = CMTime(seconds: timestamp, preferredTimescale: 600)
                guard let cgImage = try? await generator.image(at: time).image else { continue }

                let uiImage = UIImage(cgImage: cgImage)
                guard let jpegData = uiImage.jpegData(compressionQuality: 0.6) else { continue }
                frames.append((timestamp, jpegData.base64EncodedString()))
            }

            guard !frames.isEmpty else { continue }

            // Build API request
            let scored = try await callClaudeVision(
                frames: frames,
                prompt: prompt,
                apiKey: apiKey
            )
            allScored.append(contentsOf: scored)

            let progress = Double(batchEnd) / Double(candidateTimestamps.count)
            progressHandler(progress)
        }

        return allScored
    }

    // MARK: - API Call

    private func callClaudeVision(
        frames: [(time: Double, base64: String)],
        prompt: String,
        apiKey: String
    ) async throws -> [ScoredTimestamp] {
        var contentBlocks: [[String: Any]] = []

        // Add instruction text
        let instruction = """
        Analyze these video frames and score each for highlight potential.
        User wants: "\(prompt.isEmpty ? "best moments" : prompt)"
        For each frame, respond with JSON array: [{"time": <seconds>, "score": 0.0-1.0, "reason": "brief"}]
        Score based on: visual interest, action/emotion, relevance to prompt, shareability.
        """
        contentBlocks.append(["type": "text", "text": instruction])

        // Add image blocks
        for (i, frame) in frames.enumerated() {
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
            _ = i // suppress unused warning
        }

        let requestBody: [String: Any] = [
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 512,
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

        return parseResponse(data: data, frameTimes: frames.map(\.time))
    }

    // MARK: - Response Parsing

    private func parseResponse(data: Data, frameTimes: [Double]) -> [ScoredTimestamp] {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = json["content"] as? [[String: Any]],
              let textBlock = content.first(where: { $0["type"] as? String == "text" }),
              let text = textBlock["text"] as? String else {
            return frameTimes.map { ScoredTimestamp(seconds: $0, score: 0.5, reason: "Parse failed") }
        }

        // Extract JSON array from response
        guard let jsonStart = text.firstIndex(of: "["),
              let jsonEnd = text.lastIndex(of: "]") else {
            return frameTimes.map { ScoredTimestamp(seconds: $0, score: 0.5, reason: "No JSON") }
        }

        let jsonString = String(text[jsonStart...jsonEnd])
        guard let jsonData = jsonString.data(using: .utf8),
              let results = try? JSONSerialization.jsonObject(with: jsonData) as? [[String: Any]] else {
            return frameTimes.map { ScoredTimestamp(seconds: $0, score: 0.5, reason: "Invalid JSON") }
        }

        return results.compactMap { item in
            guard let time = item["time"] as? Double,
                  let score = item["score"] as? Double else { return nil }
            let reason = item["reason"] as? String ?? ""
            return ScoredTimestamp(seconds: time, score: min(max(score, 0), 1), reason: reason)
        }
    }
}

// MARK: - Keychain Helper

enum KeychainHelper {
    static func save(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    static func load(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

enum ClaudeVisionError: LocalizedError {
    case noAPIKey
    case invalidEndpoint
    case requestFailed
    case parseFailed

    var errorDescription: String? {
        switch self {
        case .noAPIKey: "Claude API key not configured."
        case .invalidEndpoint: "Invalid API endpoint."
        case .requestFailed: "Claude Vision request failed."
        case .parseFailed: "Failed to parse Claude response."
        }
    }
}
