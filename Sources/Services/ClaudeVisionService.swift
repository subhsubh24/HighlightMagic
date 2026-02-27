import Foundation
import AVFoundation
import UIKit
import Security
import os.log

actor ClaudeVisionService {
    static let shared = ClaudeVisionService()

    private let maxFramesPerRequest = 4
    private let endpoint = "https://api.anthropic.com/v1/messages"
    private let logger = Logger(subsystem: "com.highlightmagic.app", category: "ClaudeVision")
    private var lastRequestTime: Date = .distantPast
    private let minRequestInterval: TimeInterval = 1.0 // Rate limit: 1 req/sec

    /// API key resolution order:
    /// 1. Environment variable (dev/CI builds)
    /// 2. Keychain (production — set via Settings or first-launch config)
    /// 3. Info.plist "ANTHROPIC_API_KEY" (fallback for managed deployments)
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

    private init() {}

    var isAvailable: Bool {
        apiKey != nil
    }

    /// Store an API key securely for future sessions
    nonisolated static func configureAPIKey(_ key: String) {
        guard key.hasPrefix("sk-ant-") else { return }
        KeychainHelper.save(key: "claude_api_key", value: key)
    }

    /// Remove stored API key
    nonisolated static func removeAPIKey() {
        KeychainHelper.delete(key: "claude_api_key")
    }

    // MARK: - Score Highlight Candidates

    struct ScoredTimestamp: Sendable {
        let seconds: Double
        let score: Double
        let reason: String
        /// AI-suggested optimal start time for the clip (nil if Claude didn't provide one)
        let suggestedStart: Double?
        /// AI-suggested optimal end time for the clip (nil if Claude didn't provide one)
        let suggestedEnd: Double?
    }

    /// Context about a candidate segment passed to Claude for intelligent trim suggestions.
    struct CandidateSegment: Sendable {
        let midpoint: Double
        let start: Double
        let end: Double
    }

    func scoreHighlights(
        asset: AVURLAsset,
        prompt: String,
        candidates: [CandidateSegment],
        progressHandler: @Sendable (Double) -> Void
    ) async throws -> [ScoredTimestamp] {
        guard let apiKey else {
            throw ClaudeVisionError.noAPIKey
        }

        let totalDuration = CMTimeGetSeconds(try await asset.load(.duration))

        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 512, height: 512)

        var allScored: [ScoredTimestamp] = []

        // Process in batches
        let batches = stride(from: 0, to: candidates.count, by: maxFramesPerRequest)

        for batchStart in batches {
            let batchEnd = min(batchStart + maxFramesPerRequest, candidates.count)
            let batchCandidates = Array(candidates[batchStart..<batchEnd])

            // Rate limiting
            let elapsed = Date.now.timeIntervalSince(lastRequestTime)
            if elapsed < minRequestInterval {
                try? await Task.sleep(for: .seconds(minRequestInterval - elapsed))
            }

            // Extract frames — sample 3 frames per segment (start, mid, end) for better context
            var frames: [(time: Double, base64: String, segmentIdx: Int)] = []
            for (idx, candidate) in batchCandidates.enumerated() {
                let sampleTimes = [candidate.start, candidate.midpoint, candidate.end]
                for sampleTime in sampleTimes {
                    let time = CMTime(seconds: sampleTime, preferredTimescale: 600)
                    guard let cgImage = try? await generator.image(at: time).image else { continue }
                    let uiImage = UIImage(cgImage: cgImage)
                    guard let jpegData = uiImage.jpegData(compressionQuality: 0.6) else { continue }
                    frames.append((sampleTime, jpegData.base64EncodedString(), idx))
                }
            }

            guard !frames.isEmpty else { continue }

            // Build API request with retry
            do {
                let scored = try await callClaudeVisionWithRetry(
                    frames: frames.map { ($0.time, $0.base64) },
                    prompt: prompt,
                    apiKey: apiKey,
                    candidates: batchCandidates,
                    totalDuration: totalDuration
                )
                allScored.append(contentsOf: scored)
            } catch {
                lastRequestTime = .now
                throw error
            }
            lastRequestTime = .now

            let progress = Double(batchEnd) / Double(candidates.count)
            progressHandler(progress)
        }

        return allScored
    }

    // MARK: - API Call with Retry

    private func callClaudeVisionWithRetry(
        frames: [(time: Double, base64: String)],
        prompt: String,
        apiKey: String,
        candidates: [CandidateSegment],
        totalDuration: Double,
        maxRetries: Int = 2
    ) async throws -> [ScoredTimestamp] {
        var lastError: Error = ClaudeVisionError.requestFailed
        for attempt in 0...maxRetries {
            do {
                return try await callClaudeVision(
                    frames: frames, prompt: prompt, apiKey: apiKey,
                    candidates: candidates, totalDuration: totalDuration
                )
            } catch {
                lastError = error
                logger.warning("Claude Vision attempt \(attempt + 1) failed: \(error.localizedDescription)")
                if attempt < maxRetries {
                    let delay = Double(1 << attempt) // 1s, 2s exponential backoff
                    try? await Task.sleep(for: .seconds(delay))
                }
            }
        }
        throw lastError
    }

    // MARK: - API Call

    private func callClaudeVision(
        frames: [(time: Double, base64: String)],
        prompt: String,
        apiKey: String,
        candidates: [CandidateSegment],
        totalDuration: Double
    ) async throws -> [ScoredTimestamp] {
        var contentBlocks: [[String: Any]] = []

        // Build segment context string for the prompt
        let segmentContext = candidates.enumerated().map { idx, c in
            "Segment \(idx + 1): \(String(format: "%.1f", c.start))s–\(String(format: "%.1f", c.end))s (center: \(String(format: "%.1f", c.midpoint))s)"
        }.joined(separator: "\n")

        let instruction = """
        Analyze these video frames from candidate highlight segments. The video is \(String(format: "%.0f", totalDuration))s long.

        Current segment boundaries (from automated detection):
        \(segmentContext)

        For each segment, respond with a JSON array:
        [{"time": <center_seconds>, "score": 0.0-1.0, "reason": "brief description", "suggestedStart": <seconds>, "suggestedEnd": <seconds>}]

        For each segment:
        - "score": rate highlight quality based on visual interest, action/emotion, relevance, and shareability
        - "suggestedStart"/"suggestedEnd": suggest optimal trim points that tightly frame the interesting content.
          Consider: where does the action/moment naturally begin and end? Cut tight — don't pad with dead time.
          Duration must be between \(Int(Constants.minClipDuration))s and \(Int(Constants.maxClipDuration))s.
          If the current boundaries are already good, return them unchanged.
        """
        contentBlocks.append(["type": "text", "text": instruction])

        // User prompt in a separate content block to prevent prompt injection.
        let userIntent = prompt.isEmpty ? "best moments" : prompt
        contentBlocks.append(["type": "text", "text": "User's search criteria: \(userIntent)"])

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

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ClaudeVisionError.requestFailed
        }

        switch httpResponse.statusCode {
        case 200...299:
            break
        case 429:
            throw ClaudeVisionError.rateLimited
        case 401:
            throw ClaudeVisionError.invalidAPIKey
        default:
            logger.error("Claude API HTTP \(httpResponse.statusCode)")
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
            return fallbackScores(frameTimes)
        }

        // Use balanced bracket matching to extract the JSON array, avoiding
        // the first-[ to last-] approach which breaks with conversational text.
        guard let jsonString = Self.extractBalancedJSON(from: text, open: "[", close: "]") else {
            return fallbackScores(frameTimes)
        }
        guard let jsonData = jsonString.data(using: .utf8),
              let results = try? JSONSerialization.jsonObject(with: jsonData) as? [[String: Any]] else {
            return fallbackScores(frameTimes)
        }

        return results.compactMap { item in
            // Accept both Double and Int from JSON — JSONSerialization deserializes
            // integer JSON numbers as Int, not Double, so `as? Double` alone drops them.
            guard let time = Self.jsonDouble(item, "time"),
                  let score = Self.jsonDouble(item, "score") else {
                return nil
            }

            let reason = item["reason"] as? String ?? ""
            let sugStart = Self.jsonDouble(item, "suggestedStart")
            let sugEnd = Self.jsonDouble(item, "suggestedEnd")

            return ScoredTimestamp(
                seconds: time,
                score: min(max(score, 0), 1),
                reason: reason,
                suggestedStart: sugStart,
                suggestedEnd: sugEnd
            )
        }
    }

    private func fallbackScores(_ frameTimes: [Double]) -> [ScoredTimestamp] {
        frameTimes.map {
            ScoredTimestamp(seconds: $0, score: 0.5, reason: "Parse failed", suggestedStart: nil, suggestedEnd: nil)
        }
    }

    /// Safely extracts a Double from a JSON value that may be Int or Double.
    private static func jsonDouble(_ dict: [String: Any], _ key: String) -> Double? {
        if let d = dict[key] as? Double { return d }
        if let i = dict[key] as? Int { return Double(i) }
        return nil
    }

    // MARK: - JSON Extraction

    /// Extracts the first balanced JSON structure from text using bracket depth tracking.
    /// Prevents the bug where first-open to last-close grabs conversational text between
    /// multiple JSON fragments.
    static func extractBalancedJSON(from text: String, open: Character, close: Character) -> String? {
        guard let startIdx = text.firstIndex(of: open) else { return nil }
        var depth = 0
        for i in text[startIdx...].indices {
            if text[i] == open { depth += 1 }
            else if text[i] == close { depth -= 1 }
            if depth == 0 {
                return String(text[startIdx...i])
            }
        }
        return nil
    }
}

// MARK: - Keychain Helper

enum KeychainHelper {
    private static let serviceName = "com.highlightmagic.app"

    static func save(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    static func load(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}

enum ClaudeVisionError: LocalizedError {
    case noAPIKey
    case invalidAPIKey
    case invalidEndpoint
    case requestFailed
    case rateLimited
    case parseFailed

    var errorDescription: String? {
        switch self {
        case .noAPIKey: "Claude API key not configured. Add your key in Settings."
        case .invalidAPIKey: "Claude API key is invalid. Check your key in Settings."
        case .invalidEndpoint: "Invalid API endpoint."
        case .requestFailed: "Claude Vision request failed. Check your connection."
        case .rateLimited: "Too many requests. Please wait a moment."
        case .parseFailed: "Failed to parse Claude response."
        }
    }
}
